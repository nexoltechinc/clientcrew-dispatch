from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import unicodedata
from typing import Iterable, Literal, Optional
from uuid import UUID, uuid4

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..core.job_status import DispatchJobStatus, db_status_from_dispatch_status, normalize_dispatch_job_status
from ..models.dealership import Dealership
from ..models.job import Job
from ..models.skill import Skill
from ..models.technician import Technician
from ..models.zone import Zone
from ..repositories.dealership_repository import DealershipRepository
from ..schemas.job_intake import MakeJobIntakeItem
from .pre_assignment_service import PreAssignmentService


@dataclass(frozen=True)
class MakeJobUpsertResult:
    row: Job
    action: Literal["created", "updated"]


class JobWorkflowService:
    """
    Central place for explicit job workflow transitions.

    Status is a workflow stage and must never be inferred from technician presence.
    """

    ALLOWED_STATUSES = {
        DispatchJobStatus.ADMIN_PREVIEW,
        DispatchJobStatus.READY_FOR_TECH,
        DispatchJobStatus.PENDING_ADMIN_CONFIRMATION,
        DispatchJobStatus.PENDING_REVIEW,
        DispatchJobStatus.SCHEDULED,
        DispatchJobStatus.IN_PROGRESS,
        DispatchJobStatus.COMPLETED,
        DispatchJobStatus.CANCELLED,
    }

    def __init__(self, db: Session):
        self.db = db
        self.dealership_repo = DealershipRepository(db)

    def _require_job_by_id(self, job_id: UUID) -> Job:
        row = self.db.query(Job).filter(Job.id == job_id).first()
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
        return row

    def _require_job_by_code(self, job_code: str) -> Job:
        row = self.db.query(Job).filter(Job.job_code == job_code).first()
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
        return row

    @staticmethod
    def _normalize_text(value: Optional[str]) -> str:
        if not value:
            return ""
        normalized = unicodedata.normalize("NFD", value.strip().lower())
        return "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")

    def _infer_city_from_dealership_name(self, dealership_name: Optional[str]) -> Optional[str]:
        normalized_name = self._normalize_text(dealership_name)
        if not normalized_name:
            return None

        if "levis" in normalized_name:
            return "Levis"
        if "quebec" in normalized_name:
            return "Quebec"
        if "donnacona" in normalized_name:
            return "Donnacona"
        if "st-raymond" in normalized_name or "st raymond" in normalized_name or "saint-raymond" in normalized_name or "saint raymond" in normalized_name:
            return "St-Raymond"
        return None

    def _resolve_zone_id(self, *, dealership: Optional[Dealership], dealership_name: Optional[str]) -> Optional[UUID]:
        zone_lookup_name = (dealership.city if dealership is not None else None) or self._infer_city_from_dealership_name(dealership_name)
        if not zone_lookup_name:
            return None

        normalized_lookup = self._normalize_text(zone_lookup_name)
        zone_rows = self.db.query(Zone).all()
        for row in zone_rows:
            if self._normalize_text(row.name) == normalized_lookup:
                return row.id
        return None

    def _resolve_skill_id(self, *, service_name: Optional[str]) -> Optional[UUID]:
        normalized_service = self._normalize_text(service_name)
        if not normalized_service:
            return None

        skill_rows = self.db.query(Skill).all()
        normalized_skill_to_id = {self._normalize_text(row.name): row.id for row in skill_rows}

        if normalized_service in normalized_skill_to_id:
            return normalized_skill_to_id[normalized_service]

        alias_map: list[tuple[str, str]] = [
            ("ppf", "ppf"),
            ("demarreur", "remote starters"),
            ("remote starter", "remote starters"),
            ("immobilizer", "engine immobilizers"),
            ("tracking", "vehicle tracking systems"),
            ("window tint", "window tint"),
            ("teintage", "window tint"),
            ("windshield replacement", "windshield replacement"),
            ("windshield repair", "windshield repair"),
        ]
        for token, skill_name in alias_map:
            if token in normalized_service and skill_name in normalized_skill_to_id:
                return normalized_skill_to_id[skill_name]

        return None

    def _get_or_create_dealership(self, *, name: str, phone: Optional[str]) -> Optional[Dealership]:
        normalized_name = (name or "").strip()
        if not normalized_name:
            return None

        row = (
            self.db.query(Dealership)
            .filter(func.lower(Dealership.name) == normalized_name.lower())
            .first()
        )
        if row is not None:
            if phone and (row.phone or "").strip() != phone:
                # Keep dealership data fresh from automation, but only update phone for now.
                row.phone = phone
                self.db.flush()
            if not (row.city or "").strip():
                inferred_city = self._infer_city_from_dealership_name(normalized_name)
                if inferred_city:
                    row.city = inferred_city
                    self.db.flush()
            return row

        code = self.dealership_repo.generate_next_code()
        inferred_city = self._infer_city_from_dealership_name(normalized_name)
        return self.dealership_repo.create_dealership(
            code=code,
            name=normalized_name,
            phone=phone,
            email=None,
            address=None,
            city=inferred_city,
            postal_code=None,
            status="active",
            notes="Auto-created from Make.com job intake",
        )

    def _assert_status_known(self, current_status: str) -> None:
        normalized = normalize_dispatch_job_status(current_status)
        if normalized not in self.ALLOWED_STATUSES:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Unsupported job status '{current_status}' for workflow transition",
            )

    def _set_admin_review_for_new_job(self, row: Job) -> None:
        # Mandatory business rule: every new job starts in admin_review, regardless of source.
        row.status = db_status_from_dispatch_status(DispatchJobStatus.ADMIN_PREVIEW)

    def _resolve_unique_job_code_for_make(self, requested_code: str) -> str:
        trimmed = requested_code.strip()
        if not trimmed:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="job_id is required")

        base_code = trimmed[:50]
        exists = self.db.query(Job.id).filter(Job.job_code == base_code).first()
        if exists is None:
            return base_code

        # Make retries/re-submissions must not overwrite prior jobs.
        # Keep the original code recognizable while guaranteeing uniqueness.
        max_base_len = 45  # leaves room for "-0001"
        suffix_base = base_code[:max_base_len]
        for idx in range(1, 10_000):
            candidate = f"{suffix_base}-{idx:04d}"
            if self.db.query(Job.id).filter(Job.job_code == candidate).first() is None:
                return candidate

        # Highly defensive fallback if many collisions happen.
        return f"{suffix_base[:41]}-{uuid4().hex[:8]}"

    def upsert_jobs_from_make(self, items: Iterable[MakeJobIntakeItem]) -> list[MakeJobUpsertResult]:
        results: list[MakeJobUpsertResult] = []

        for item in items:
            job_code = self._resolve_unique_job_code_for_make(item.job_id)

            dealership = self._get_or_create_dealership(
                name=item.dealership.dealership_name,
                phone=item.dealership.telephone,
            )

            row = Job(
                job_code=job_code,
                status=db_status_from_dispatch_status(DispatchJobStatus.ADMIN_PREVIEW),
            )
            self.db.add(row)
            action: Literal["created", "updated"] = "created"

            row.dealership_id = dealership.id if dealership is not None else None
            row.customer_name = dealership.name if dealership is not None else row.customer_name
            row.service_type = item.dealership.service or row.service_type
            resolved_skill_id = self._resolve_skill_id(service_name=row.service_type)
            if resolved_skill_id is not None:
                row.skill_id = resolved_skill_id
            resolved_zone_id = self._resolve_zone_id(
                dealership=dealership,
                dealership_name=item.dealership.dealership_name,
            )
            if resolved_zone_id is not None:
                row.zone_id = resolved_zone_id
            row.vehicle = item.vehicle
            row.requested_service_date = item.date
            row.requested_service_time = item.time
            row.source_system = "make.com"
            row.source_metadata = {
                "source": "make.com",
                "dealership": {
                    "dealership_name": item.dealership.dealership_name,
                    "telephone": item.dealership.telephone,
                    "service": item.dealership.service,
                },
                "vehicle_number": item.vehicle_number,
                "urgent": item.urgent,
                "confidence": item.confidence,
                "flags": item.flags,
                "raw": item.raw,
            }

            if action == "created":
                self._set_admin_review_for_new_job(row)

            self.db.flush()
            if normalize_dispatch_job_status(row.status) == DispatchJobStatus.ADMIN_PREVIEW:
                # Suggest the best technician while keeping explicit admin confirmation step.
                row = PreAssignmentService(self.db).suggest_for_admin_review(row.id)
            results.append(MakeJobUpsertResult(row=row, action=action))

        self.db.commit()
        for result in results:
            self.db.refresh(result.row)
        return results

    def assign_technician_by_admin(self, *, job_id: UUID, technician_id: UUID) -> Job:
        row = self._require_job_by_id(job_id)
        tech = self.db.query(Technician).filter(Technician.id == technician_id).first()
        if tech is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Technician not found")

        self._assert_status_known(row.status)
        current = normalize_dispatch_job_status(row.status)
        if current in {DispatchJobStatus.COMPLETED, DispatchJobStatus.CANCELLED}:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cannot assign technician to completed/cancelled job")

        row.assigned_tech_id = technician_id
        if current == DispatchJobStatus.ADMIN_PREVIEW:
            # Mandatory rule: admin assignment moves admin_review -> scheduled.
            row.status = db_status_from_dispatch_status(DispatchJobStatus.SCHEDULED)

        self.db.commit()
        self.db.refresh(row)
        return row

    def complete_job_from_technician_signal(self, *, job_code: str, completed_at: Optional[datetime] = None) -> Job:
        row = self._require_job_by_code(job_code)
        self._assert_status_known(row.status)

        current = normalize_dispatch_job_status(row.status)
        if current not in {DispatchJobStatus.SCHEDULED, DispatchJobStatus.IN_PROGRESS}:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Job in status '{row.status}' cannot transition to completed",
            )

        row.status = db_status_from_dispatch_status(DispatchJobStatus.COMPLETED)
        row.completed_at = (completed_at or datetime.now(timezone.utc))
        self.db.commit()
        self.db.refresh(row)
        return row

    def cancel_job_by_admin(self, *, job_id: UUID) -> Job:
        row = self._require_job_by_id(job_id)
        self._assert_status_known(row.status)

        if normalize_dispatch_job_status(row.status) == DispatchJobStatus.COMPLETED:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Completed jobs cannot be cancelled")

        row.status = db_status_from_dispatch_status(DispatchJobStatus.CANCELLED)
        self.db.commit()
        self.db.refresh(row)
        return row

    def mark_ready_for_tech_and_pre_assign(self, *, job_id: UUID) -> Job:
        row = self._require_job_by_id(job_id)
        self._assert_status_known(row.status)
        if normalize_dispatch_job_status(row.status) in {DispatchJobStatus.COMPLETED, DispatchJobStatus.CANCELLED}:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Completed/cancelled jobs cannot be moved to READY_FOR_TECH")

        row.status = PreAssignmentService.READY_FOR_TECH
        self.db.flush()
        return PreAssignmentService(self.db).pre_assign_technician(row.id)
