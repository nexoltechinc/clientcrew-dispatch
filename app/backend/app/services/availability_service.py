from dataclasses import dataclass
from datetime import date, datetime, time, timezone
from typing import Optional
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from ..core.enums import TechnicianStatus
from ..repositories.technician_repository import TechnicianRepository


@dataclass(frozen=True)
class AvailabilityInputs:
    status: str
    manual_availability: bool
    schedule_enabled: bool
    start_time: Optional[time]
    end_time: Optional[time]
    has_active_time_off: bool
    current_time: time


def compute_effective_availability_from_inputs(inputs: AvailabilityInputs) -> bool:
    if str(inputs.status).lower() != TechnicianStatus.ACTIVE.value:
        return False
    if not inputs.manual_availability:
        return False
    if not inputs.schedule_enabled:
        return False
    if inputs.start_time is None or inputs.end_time is None:
        return False
    if not (inputs.start_time <= inputs.current_time < inputs.end_time):
        return False
    if inputs.has_active_time_off:
        return False
    return True


class AvailabilityService:
    def __init__(self, db: Session, repository: Optional[TechnicianRepository] = None):
        self.db = db
        self.repo = repository or TechnicianRepository(db)

    def compute_effective_availability(self, technician_id: UUID, now: Optional[datetime] = None) -> bool:
        utc_now = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
        technician = self.repo.get_technician_by_id(technician_id)
        if technician is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Technician not found",
            )

        schedule = self.repo.get_working_hours_for_day(technician_id, utc_now.weekday())
        has_active_time_off = self.repo.has_active_time_off(technician_id, utc_now.date())

        inputs = AvailabilityInputs(
            status=technician.status,
            manual_availability=technician.manual_availability,
            schedule_enabled=bool(schedule and schedule.is_enabled),
            start_time=schedule.start_time if schedule else None,
            end_time=schedule.end_time if schedule else None,
            has_active_time_off=has_active_time_off,
            current_time=utc_now.time().replace(tzinfo=None),
        )
        return compute_effective_availability_from_inputs(inputs)

    def is_on_leave_now(self, technician_id: UUID, now: Optional[datetime] = None) -> bool:
        utc_now = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
        return self.repo.has_active_time_off(technician_id, utc_now.date())

    def current_shift_window(self, technician_id: UUID, now: Optional[datetime] = None) -> Optional[str]:
        utc_now = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
        schedule = self.repo.get_working_hours_for_day(technician_id, utc_now.weekday())
        if schedule is None or not schedule.is_enabled:
            return None
        return f"{schedule.start_time.strftime('%H:%M')}-{schedule.end_time.strftime('%H:%M')}"

    def next_time_off_start(self, technician_id: UUID, from_date: Optional[date] = None) -> Optional[date]:
        anchor = from_date or datetime.now(timezone.utc).date()
        return self.repo.get_next_time_off_start(technician_id, anchor)
