from datetime import datetime, timezone
from typing import Any, List, Tuple
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from ..core.job_status import DispatchJobStatus, db_status_from_dispatch_status, normalize_status
from ..models.dealership import Dealership
from ..models.job import Job
from ..models.job_event import JobEvent
from ..models.zone import Zone
from ..schemas.technician_profile import TechnicianJobFeedItem, TechnicianJobFeedResponse
from .job_services_service import JobServicesService


class TechnicianJobsService:
    def __init__(self, db: Session):
        self.db = db

    def get_job_feed(self, technician_id: UUID) -> TechnicianJobFeedResponse:
        rows: List[Tuple[Job, Dealership, Zone]] = (
            self.db.query(Job, Dealership, Zone)
            .outerjoin(Dealership, Dealership.id == Job.dealership_id)
            .outerjoin(Zone, Zone.id == Job.zone_id)
            .filter(Job.assigned_tech_id == technician_id)
            .order_by(Job.updated_at.desc(), Job.created_at.desc())
            .all()
        )

        available_jobs: List[TechnicianJobFeedItem] = []
        my_jobs: List[TechnicianJobFeedItem] = []
        job_services_service = JobServicesService(self.db)
        for job, dealership, zone in rows:
            status = normalize_status(job.status)
            # Never expose pre-confirmation/admin-only stages to technician portal.
            if status in {
                DispatchJobStatus.ADMIN_PREVIEW,
                DispatchJobStatus.READY_FOR_TECH,
                DispatchJobStatus.PENDING_ADMIN_CONFIRMATION,
                DispatchJobStatus.PENDING_REVIEW,
            }:
                continue

            service_rows = job_services_service.list_service_rows(job)
            service_names = job_services_service.list_service_names(job)
            item = TechnicianJobFeedItem(
                id=job.id,
                job_code=job.job_code,
                status=status.value,
                dealership_name=dealership.name if dealership is not None else None,
                service_name=service_names[0] if service_names else job.service_type,
                service_names=service_names,
                service_entries=job_services_service.serialize_service_rows(service_rows),
                vehicle_summary=job.vehicle,
                zone_name=self._resolve_zone_name(job=job, dealership=dealership, zone=zone),
                requested_service_date=job.requested_service_date,
                requested_service_time=job.requested_service_time,
                created_at=job.created_at,
                updated_at=job.updated_at,
            )

            if status == DispatchJobStatus.PENDING:
                available_jobs.append(item)
            else:
                my_jobs.append(item)

        return TechnicianJobFeedResponse(available_jobs=available_jobs, my_jobs=my_jobs)

    def start_my_job(self, technician_id: UUID, job_id: UUID) -> Job:
        return self._transition_my_job_status(
            technician_id=technician_id,
            job_id=job_id,
            target_status=DispatchJobStatus.IN_PROGRESS,
            allowed_current_statuses={DispatchJobStatus.SCHEDULED, DispatchJobStatus.DELAYED},
            event_type="TECH_JOB_STARTED",
            event_payload={},
        )

    def accept_my_job(self, technician_id: UUID, job_id: UUID) -> Job:
        return self._transition_my_job_status(
            technician_id=technician_id,
            job_id=job_id,
            target_status=DispatchJobStatus.SCHEDULED,
            allowed_current_statuses={DispatchJobStatus.PENDING},
            event_type="TECH_JOB_ACCEPTED",
            event_payload={},
        )

    def complete_my_job(self, technician_id: UUID, job_id: UUID) -> Job:
        row = self._transition_my_job_status(
            technician_id=technician_id,
            job_id=job_id,
            target_status=DispatchJobStatus.COMPLETED,
            allowed_current_statuses={DispatchJobStatus.IN_PROGRESS},
            event_type="TECH_JOB_COMPLETED",
            event_payload={},
        )
        if row.completed_at is None:
            row.completed_at = datetime.now(timezone.utc)
            self.db.commit()
            self.db.refresh(row)
        return row

    def delay_my_job(self, technician_id: UUID, job_id: UUID, *, minutes: int | None, note: str | None) -> Job:
        return self._transition_my_job_status(
            technician_id=technician_id,
            job_id=job_id,
            target_status=DispatchJobStatus.DELAYED,
            allowed_current_statuses={DispatchJobStatus.SCHEDULED, DispatchJobStatus.IN_PROGRESS},
            event_type="TECH_JOB_DELAYED",
            event_payload={
                "minutes": minutes,
                "note": note,
            },
        )

    def refuse_my_job(self, technician_id: UUID, job_id: UUID, *, reason: str | None, comment: str | None) -> Job:
        with self.db.begin():
            row = self._lock_assigned_job(job_id=job_id)
            if row.assigned_tech_id != technician_id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Job is not assigned to current technician")

            current_status = normalize_status(row.status)
            if current_status not in {DispatchJobStatus.PENDING, DispatchJobStatus.SCHEDULED, DispatchJobStatus.DELAYED}:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Job in status {current_status.value} cannot be refused",
                )

            row.assigned_tech_id = None
            row.status = db_status_from_dispatch_status(DispatchJobStatus.PENDING)
            row.completed_at = None
            self.db.add(
                JobEvent(
                    job_id=row.id,
                    event_type="TECH_JOB_REFUSED",
                    actor_type="TECHNICIAN",
                    payload_json={
                        "technician_id": str(technician_id),
                        "reason": reason,
                        "comment": comment,
                    },
                )
            )

        self.db.refresh(row)
        return row

    def add_service_to_my_job(self, technician_id: UUID, job_id: UUID, *, service_name: str, notes: str | None) -> Job:
        with self.db.begin():
            row = self._lock_assigned_job(job_id=job_id)
            if row.assigned_tech_id != technician_id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Job is not assigned to current technician")

            current_status = normalize_status(row.status)
            if current_status not in {DispatchJobStatus.SCHEDULED, DispatchJobStatus.IN_PROGRESS, DispatchJobStatus.DELAYED}:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Job in status {current_status.value} cannot be updated",
                )

            JobServicesService(self.db).add_service(
                job=row,
                service_name=service_name,
                source="technician",
                notes=notes,
                created_by_user_id=technician_id,
                audit_actor_type="TECHNICIAN",
            )

        self.db.refresh(row)
        return row

    def update_service_on_my_job(
        self,
        technician_id: UUID,
        job_id: UUID,
        *,
        service_id: UUID,
        service_name: str,
        notes: str | None,
    ) -> Job:
        with self.db.begin():
            row = self._lock_assigned_job(job_id=job_id)
            if row.assigned_tech_id != technician_id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Job is not assigned to current technician")

            current_status = normalize_status(row.status)
            if current_status not in {DispatchJobStatus.SCHEDULED, DispatchJobStatus.IN_PROGRESS, DispatchJobStatus.DELAYED}:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Job in status {current_status.value} cannot be updated",
                )

            services = JobServicesService(self.db)
            service_row = services.get_service_row(job=row, service_id=service_id)
            if service_row is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job service not found")
            if service_row.source != "technician":
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only technician-added services can be edited")

            try:
                services.update_service(
                    job=row,
                    service_id=service_id,
                    service_name=service_name,
                    notes=notes,
                    created_by_user_id=technician_id,
                    audit_actor_type="TECHNICIAN",
                )
            except ValueError as exc:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

        self.db.refresh(row)
        return row

    def remove_service_from_my_job(self, technician_id: UUID, job_id: UUID, *, service_id: UUID) -> Job:
        with self.db.begin():
            row = self._lock_assigned_job(job_id=job_id)
            if row.assigned_tech_id != technician_id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Job is not assigned to current technician")

            current_status = normalize_status(row.status)
            if current_status not in {DispatchJobStatus.SCHEDULED, DispatchJobStatus.IN_PROGRESS, DispatchJobStatus.DELAYED}:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Job in status {current_status.value} cannot be updated",
                )

            services = JobServicesService(self.db)
            service_row = services.get_service_row(job=row, service_id=service_id)
            if service_row is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job service not found")
            if service_row.source != "technician":
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only technician-added services can be removed")

            if not services.remove_service(
                job=row,
                service_id=service_id,
                created_by_user_id=technician_id,
                audit_actor_type="TECHNICIAN",
            ):
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job service not found")

        self.db.refresh(row)
        return row

    def _transition_my_job_status(
        self,
        *,
        technician_id: UUID,
        job_id: UUID,
        target_status: DispatchJobStatus,
        allowed_current_statuses: set[DispatchJobStatus],
        event_type: str,
        event_payload: dict[str, Any],
    ) -> Job:
        with self.db.begin():
            row = self._lock_assigned_job(job_id=job_id)
            if row.assigned_tech_id != technician_id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Job is not assigned to current technician")

            current_status = normalize_status(row.status)
            if current_status == target_status:
                return row
            if current_status not in allowed_current_statuses:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Job in status {current_status.value} cannot transition to {target_status.value}",
                )

            row.status = db_status_from_dispatch_status(target_status)
            if target_status != DispatchJobStatus.COMPLETED:
                row.completed_at = None
            self.db.add(
                JobEvent(
                    job_id=row.id,
                    event_type=event_type,
                    actor_type="TECHNICIAN",
                    payload_json={
                        "technician_id": str(technician_id),
                        **event_payload,
                    },
                )
            )

        self.db.refresh(row)
        return row

    def _lock_assigned_job(self, *, job_id: UUID) -> Job:
        row = self.db.query(Job).filter(Job.id == job_id).with_for_update().first()
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
        return row

    @staticmethod
    def _resolve_zone_name(*, job: Job, dealership: Dealership | None, zone: Zone | None) -> str | None:
        if zone is not None and zone.name:
            normalized_zone = zone.name.strip()
            if normalized_zone:
                return normalized_zone

        if job.location:
            normalized_location = job.location.strip()
            if normalized_location:
                return normalized_location

        if job.customer_city:
            normalized_customer_city = job.customer_city.strip()
            if normalized_customer_city:
                return normalized_customer_city

        if dealership is not None and dealership.city:
            normalized_city = dealership.city.strip()
            if normalized_city:
                return normalized_city

        if dealership is not None and dealership.name:
            # Deterministic fallback for legacy dealership records missing city.
            normalized_name = dealership.name.strip().lower()
            inferred_city_map = {
                "levis": "Levis",
                "lévis": "Levis",
                "quebec": "Quebec",
                "québec": "Quebec",
                "donnacona": "Donnacona",
                "st-raymond": "St-Raymond",
                "st raymond": "St-Raymond",
                "saint-raymond": "St-Raymond",
                "saint raymond": "St-Raymond",
            }
            for token, city in inferred_city_map.items():
                if token in normalized_name:
                    return city

        return None
