from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Optional
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import and_, exists, func, not_, or_
from sqlalchemy.orm import Session

from ..core.job_status import DispatchJobStatus, normalize_dispatch_job_status
from ..models.job import Job
from ..models.job_event import JobEvent
from ..models.skill import technician_skills
from ..models.technician import Technician
from ..models.time_off import TimeOff
from ..models.working_hours import WorkingHours
from ..models.zone import technician_zones


@dataclass(frozen=True)
class _Candidate:
    technician: Technician
    earliest_slot: datetime
    priority_rank: int


class PreAssignmentService:
    READY_FOR_TECH = "READY_FOR_TECH"
    PENDING_ADMIN_CONFIRMATION = "PENDING_ADMIN_CONFIRMATION"
    PENDING_REVIEW = "PENDING_REVIEW"
    NO_ELIGIBLE_TECHNICIAN = "NO_ELIGIBLE_TECHNICIAN"

    def __init__(self, db: Session):
        self.db = db

    def pre_assign_technician(self, job_id: UUID) -> Job:
        tx = self.db.begin_nested() if self.db.in_transaction() else self.db.begin()
        with tx:
            row = self._lock_job(job_id)
            self._ensure_allowed_state_or_idempotent(row)
            if row.status != self.READY_FOR_TECH:
                # Idempotent no-op path.
                self.db.flush()
                return row

            selected, evaluated_ids, selection_reason = self._pick_candidate(row)
            if selected is None:
                row.pre_assigned_technician_id = None
                row.pre_assignment_reason = self.NO_ELIGIBLE_TECHNICIAN
                row.status = self.PENDING_REVIEW
                self._insert_job_event(
                    job_id=row.id,
                    payload={
                        "selected_technician_id": None,
                        "evaluated_candidates": evaluated_ids,
                        "selection_reason": self.NO_ELIGIBLE_TECHNICIAN,
                    },
                )
                self.db.flush()
                return row

            row.pre_assigned_technician_id = selected.id
            row.pre_assignment_reason = None
            row.status = self.PENDING_ADMIN_CONFIRMATION
            self._insert_job_event(
                job_id=row.id,
                payload={
                    "selected_technician_id": str(selected.id),
                    "evaluated_candidates": evaluated_ids,
                    "selection_reason": selection_reason,
                },
            )
            self.db.flush()

        self.db.refresh(row)
        return row

    def suggest_for_admin_review(self, job_id: UUID) -> Job:
        tx = self.db.begin_nested() if self.db.in_transaction() else self.db.begin()
        with tx:
            row = self._lock_job(job_id)
            normalized_status = normalize_dispatch_job_status(row.status)
            if normalized_status in {DispatchJobStatus.CANCELLED, DispatchJobStatus.COMPLETED}:
                self.db.flush()
                return row

            previous_pre_assigned_id = row.pre_assigned_technician_id
            previous_pre_assignment_reason = row.pre_assignment_reason

            selected, evaluated_ids, selection_reason = self._pick_candidate(row)
            if selected is None:
                row.pre_assigned_technician_id = None
                row.pre_assignment_reason = self.NO_ELIGIBLE_TECHNICIAN
                payload = {
                    "selected_technician_id": None,
                    "evaluated_candidates": evaluated_ids,
                    "selection_reason": self.NO_ELIGIBLE_TECHNICIAN,
                }
            else:
                row.pre_assigned_technician_id = selected.id
                row.pre_assignment_reason = None
                payload = {
                    "selected_technician_id": str(selected.id),
                    "evaluated_candidates": evaluated_ids,
                    "selection_reason": selection_reason,
                }

            changed = (
                previous_pre_assigned_id != row.pre_assigned_technician_id
                or previous_pre_assignment_reason != row.pre_assignment_reason
            )
            if changed:
                self._insert_job_event(job_id=row.id, payload=payload)

            self.db.flush()

        self.db.refresh(row)
        return row

    def _lock_job(self, job_id: UUID) -> Job:
        row = (
            self.db.query(Job)
            .filter(Job.id == job_id)
            .with_for_update()
            .first()
        )
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
        return row

    def _ensure_allowed_state_or_idempotent(self, row: Job) -> None:
        if row.status == self.READY_FOR_TECH:
            return
        if (
            row.status == self.PENDING_ADMIN_CONFIRMATION
            and row.pre_assigned_technician_id is not None
        ):
            return
        if (
            row.status == self.PENDING_REVIEW
            and row.pre_assignment_reason == self.NO_ELIGIBLE_TECHNICIAN
        ):
            return
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Job is in state {row.status}, not {self.READY_FOR_TECH}",
        )

    def _pick_candidate(self, row: Job) -> tuple[Optional[Technician], list[str], str]:
        service_date = row.requested_service_date or datetime.now(timezone.utc).date()
        exclusive_id = self._get_exclusive_technician_id(row.source_metadata)
        technicians = self._eligible_technicians(row, service_date, exclusive_id)
        if not technicians:
            return None, [], self.NO_ELIGIBLE_TECHNICIAN

        candidates = [
            _Candidate(
                technician=tech,
                earliest_slot=self._compute_earliest_available_slot(tech.id, service_date),
                priority_rank=int(tech.priority_rank if tech.priority_rank is not None else 100),
            )
            for tech in technicians
        ]

        candidates.sort(
            key=lambda c: (
                0 if exclusive_id is not None and c.technician.id == exclusive_id else 1,
                c.earliest_slot,
                c.priority_rank,
                str(c.technician.id),
            )
        )
        selection_reason = "exclusive_technician" if exclusive_id is not None else "earliest_slot_then_priority_rank"
        evaluated = [str(candidate.technician.id) for candidate in candidates]
        return candidates[0].technician, evaluated, selection_reason

    def _eligible_technicians(
        self,
        row: Job,
        service_date: date,
        exclusive_id: Optional[UUID],
    ) -> list[Technician]:
        if row.skill_id is None or row.zone_id is None:
            return []

        overlap_condition = (
            and_(
                Job.requested_service_date == row.requested_service_date,
                or_(
                    row.requested_service_time is None,
                    Job.requested_service_time.is_(None),
                    Job.requested_service_time == row.requested_service_time,
                ),
            )
            if row.requested_service_date is not None
            else (Job.requested_service_date.is_(None))
        )

        blocking_statuses = (
            "scheduled",
            "in_progress",
            "pending_admin_confirmation",
            "SCHEDULED",
            "IN_PROGRESS",
            "PENDING_ADMIN_CONFIRMATION",
        )

        query = (
            self.db.query(Technician)
            .filter(func.lower(Technician.status) == "active")
            .filter(
                exists().where(
                    and_(
                        technician_skills.c.technician_id == Technician.id,
                        technician_skills.c.skill_id == row.skill_id,
                    )
                )
            )
            .filter(
                exists().where(
                    and_(
                        technician_zones.c.technician_id == Technician.id,
                        technician_zones.c.zone_id == row.zone_id,
                    )
                )
            )
            .filter(
                not_(
                    exists().where(
                        and_(
                            TimeOff.technician_id == Technician.id,
                            TimeOff.cancelled_at.is_(None),
                            TimeOff.start_date <= service_date,
                            TimeOff.end_date >= service_date,
                        )
                    )
                )
            )
            .filter(
                not_(
                    exists().where(
                        and_(
                            Job.assigned_tech_id == Technician.id,
                            Job.id != row.id,
                            Job.status.in_(blocking_statuses),
                            overlap_condition,
                        )
                    )
                )
            )
        )

        if exclusive_id is not None:
            query = query.filter(Technician.id == exclusive_id)

        return query.order_by(Technician.id.asc()).all()

    def _compute_earliest_available_slot(self, technician_id: UUID, anchor_date: date) -> datetime:
        working_rows = (
            self.db.query(WorkingHours)
            .filter(WorkingHours.technician_id == technician_id)
            .all()
        )
        working_by_day = {row.day_of_week: row for row in working_rows}

        busy_dates = {
            row[0]
            for row in (
                self.db.query(Job.requested_service_date)
                .filter(
                    Job.assigned_tech_id == technician_id,
                    Job.requested_service_date.is_not(None),
                    Job.status.in_(["scheduled", "SCHEDULED", "in_progress", "IN_PROGRESS"]),
                )
                .all()
            )
            if row[0] is not None
        }
        time_off_rows = (
            self.db.query(TimeOff.start_date, TimeOff.end_date)
            .filter(
                TimeOff.technician_id == technician_id,
                TimeOff.cancelled_at.is_(None),
            )
            .all()
        )

        for offset in range(0, 30):
            candidate_date = anchor_date + timedelta(days=offset)
            if candidate_date in busy_dates:
                continue
            if self._date_in_time_off_ranges(candidate_date, time_off_rows):
                continue

            working = working_by_day.get(candidate_date.weekday())
            if working is None or not working.is_enabled:
                continue

            start_time = working.start_time or time(0, 0)
            return datetime.combine(candidate_date, start_time).replace(tzinfo=timezone.utc)

        # Deterministic fallback when no working slot is found in lookahead window.
        return datetime.combine(anchor_date + timedelta(days=365), time(0, 0)).replace(tzinfo=timezone.utc)

    @staticmethod
    def _date_in_time_off_ranges(candidate_date: date, rows: list[tuple[date, date]]) -> bool:
        for start_date, end_date in rows:
            if start_date <= candidate_date <= end_date:
                return True
        return False

    @staticmethod
    def _get_exclusive_technician_id(source_metadata: Any) -> Optional[UUID]:
        if not isinstance(source_metadata, dict):
            return None

        possible = (
            source_metadata.get("exclusive_technician_id")
            or source_metadata.get("exclusive_tech_id")
            or source_metadata.get("exclusiveTechnicianId")
        )
        if not possible:
            return None
        try:
            return UUID(str(possible))
        except (ValueError, TypeError):
            return None

    def _insert_job_event(self, *, job_id: UUID, payload: dict[str, Any]) -> None:
        self.db.add(
            JobEvent(
                job_id=job_id,
                event_type="TECH_PRE_ASSIGNED",
                actor_type="SYSTEM",
                payload_json=payload,
            )
        )
