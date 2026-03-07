from datetime import datetime, timezone
from typing import Dict, List, Sequence
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..core.enums import AuditEntityType, TimeOffEntryType, UserRole
from ..core.security import AuthenticatedUser
from ..repositories.technician_repository import TechnicianRepository
from ..schemas.technician_profile import (
    AdminTimeOffCreateRequest,
    SkillResponse,
    SkillCreateRequest,
    TechnicianCreateRequest,
    TechnicianListItemResponse,
    TechnicianProfileResponse,
    TechnicianUpdateRequest,
    TimeOffResponseItem,
    WeeklyScheduleResponseItem,
    WeeklyScheduleUpdateItem,
    ZoneCreateRequest,
    ZoneResponse,
)
from .audit_service import AuditService
from .availability_service import AvailabilityService


class TechnicianAdminService:
    def __init__(self, db: Session, current_user: AuthenticatedUser):
        self.db = db
        self.current_user = current_user
        self.repo = TechnicianRepository(db)
        self.availability_service = AvailabilityService(db, repository=self.repo)

    def _require_technician(self, technician_id: UUID):
        technician = self.repo.get_technician_by_id(technician_id)
        if technician is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Technician not found")
        return technician

    def _build_weekly_schedule(self, technician_id: UUID) -> List[WeeklyScheduleResponseItem]:
        rows = self.repo.list_weekly_schedule(technician_id)
        by_day: Dict[int, WeeklyScheduleResponseItem] = {
            row.day_of_week: WeeklyScheduleResponseItem(
                day_of_week=row.day_of_week,
                is_enabled=row.is_enabled,
                start_time=row.start_time,
                end_time=row.end_time,
            )
            for row in rows
        }

        output: List[WeeklyScheduleResponseItem] = []
        for day in range(7):
            output.append(
                by_day.get(
                    day,
                    WeeklyScheduleResponseItem(
                        day_of_week=day,
                        is_enabled=False,
                        start_time=None,
                        end_time=None,
                    ),
                )
            )
        return output

    def _build_time_off_items(self, technician_id: UUID) -> List[TimeOffResponseItem]:
        today = datetime.now(timezone.utc).date()
        rows = self.repo.list_upcoming_time_off(technician_id, today)
        return [
            TimeOffResponseItem(
                id=row.id,
                technician_id=row.technician_id,
                entry_type=row.entry_type,
                start_date=row.start_date,
                end_date=row.end_date,
                reason=row.reason,
                created_at=row.created_at,
                cancelled_at=row.cancelled_at,
            )
            for row in rows
        ]

    def list_technicians(self) -> List[TechnicianListItemResponse]:
        technicians = self.repo.list_technicians()
        results: List[TechnicianListItemResponse] = []

        for technician in technicians:
            zones = [ZoneResponse(id=zone.id, name=zone.name) for zone in self.repo.list_technician_zones(technician.id)]
            skills = [SkillResponse(id=skill.id, name=skill.name) for skill in self.repo.list_technician_skills(technician.id)]
            pending_email_change = self.repo.get_pending_email_change_request(technician.id)
            schedule_rows = self.repo.list_weekly_schedule(technician.id)
            working_days = (
                [int(day) for day in technician.working_days]
                if isinstance(technician.working_days, list)
                else [row.day_of_week for row in schedule_rows if row.is_enabled]
            )
            start_time = technician.working_hours_start or next((row.start_time for row in schedule_rows if row.is_enabled), None)
            end_time = technician.working_hours_end or next((row.end_time for row in schedule_rows if row.is_enabled), None)

            results.append(
                TechnicianListItemResponse(
                    id=technician.id,
                    name=technician.full_name or technician.name,
                    full_name=technician.full_name or technician.name,
                    email=technician.email,
                    phone=technician.phone,
                    profile_picture_url=technician.profile_picture_url,
                    status=technician.status,
                    manual_availability=technician.manual_availability,
                    effective_availability=self.availability_service.compute_effective_availability(technician.id),
                    on_leave_now=self.availability_service.is_on_leave_now(technician.id),
                    current_shift_window=self.availability_service.current_shift_window(technician.id),
                    next_time_off_start=self.availability_service.next_time_off_start(technician.id),
                    working_days=[int(day) for day in working_days],
                    working_hours_start=start_time,
                    working_hours_end=end_time,
                    after_hours_enabled=bool(technician.after_hours_enabled),
                    has_pending_email_change_request=pending_email_change is not None,
                    pending_email_change_request_id=pending_email_change.id if pending_email_change else None,
                    pending_email_change_requested_email=(
                        pending_email_change.requested_email if pending_email_change else None
                    ),
                    zones=zones,
                    skills=skills,
                    current_jobs_count=self.repo.get_current_jobs_count(technician.id),
                )
            )

        return results

    def get_profile(self, technician_id: UUID) -> TechnicianProfileResponse:
        technician = self._require_technician(technician_id)

        zones = [ZoneResponse(id=zone.id, name=zone.name) for zone in self.repo.list_technician_zones(technician_id)]
        skills = [SkillResponse(id=skill.id, name=skill.name) for skill in self.repo.list_technician_skills(technician_id)]
        pending_email_change = self.repo.get_pending_email_change_request(technician_id)
        schedule_rows = self.repo.list_weekly_schedule(technician_id)
        working_days = (
            [int(day) for day in technician.working_days]
            if isinstance(technician.working_days, list)
            else [row.day_of_week for row in schedule_rows if row.is_enabled]
        )
        start_time = technician.working_hours_start or next((row.start_time for row in schedule_rows if row.is_enabled), None)
        end_time = technician.working_hours_end or next((row.end_time for row in schedule_rows if row.is_enabled), None)

        return TechnicianProfileResponse(
            id=technician.id,
            name=technician.full_name or technician.name,
            full_name=technician.full_name or technician.name,
            email=technician.email,
            phone=technician.phone,
            profile_picture_url=technician.profile_picture_url,
            status=technician.status,
            manual_availability=technician.manual_availability,
            effective_availability=self.availability_service.compute_effective_availability(technician_id),
            on_leave_now=self.availability_service.is_on_leave_now(technician_id),
            current_shift_window=self.availability_service.current_shift_window(technician_id),
            next_time_off_start=self.availability_service.next_time_off_start(technician_id),
            working_days=working_days,
            working_hours_start=start_time,
            working_hours_end=end_time,
            after_hours_enabled=bool(technician.after_hours_enabled),
            has_pending_email_change_request=pending_email_change is not None,
            pending_email_change_request_id=pending_email_change.id if pending_email_change else None,
            pending_email_change_requested_email=(
                pending_email_change.requested_email if pending_email_change else None
            ),
            zones=zones,
            skills=skills,
            weekly_schedule=self._build_weekly_schedule(technician_id),
            upcoming_time_off=self._build_time_off_items(technician_id),
        )

    def create_technician(self, payload: TechnicianCreateRequest) -> TechnicianProfileResponse:
        normalized_email = payload.email.strip().lower()
        if self.repo.email_exists(normalized_email):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already exists")

        status_value = payload.status.value if hasattr(payload.status, "value") else str(payload.status)
        try:
            technician = self.repo.create_technician(
                name=payload.name,
                email=normalized_email,
                phone=payload.phone,
                password=payload.password,
                status=status_value,
                manual_availability=payload.manual_availability,
            )
        except IntegrityError as exc:
            self.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Technician email already exists") from exc

        AuditService.log_event(
            self.db,
            actor_role=UserRole.ADMIN,
            actor_id=self.current_user.user_id,
            action="admin.technician.created",
            entity_type=AuditEntityType.TECHNICIAN.value,
            entity_id=technician.id,
            metadata={
                "name": technician.name,
                "email": technician.email,
                "status": technician.status,
                "manual_availability": technician.manual_availability,
            },
        )
        self.db.commit()
        return self.get_profile(technician.id)

    def update_technician(self, technician_id: UUID, payload: TechnicianUpdateRequest) -> TechnicianProfileResponse:
        self._require_technician(technician_id)

        update_fields = payload.dict(exclude_unset=True)
        if not update_fields:
            return self.get_profile(technician_id)
        if "status" in update_fields and hasattr(update_fields["status"], "value"):
            update_fields["status"] = update_fields["status"].value
        if "name" in update_fields:
            update_fields["full_name"] = update_fields["name"]

        try:
            self.repo.update_technician_fields(technician_id, update_fields)
        except IntegrityError as exc:
            self.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Technician email already exists") from exc

        audit_changes = dict(update_fields)
        if "password" in audit_changes:
            audit_changes["password"] = "[redacted]"
        AuditService.log_event(
            self.db,
            actor_role=UserRole.ADMIN,
            actor_id=self.current_user.user_id,
            action="admin.technician.updated",
            entity_type=AuditEntityType.TECHNICIAN.value,
            entity_id=technician_id,
            metadata={"changes": audit_changes},
        )
        self.db.commit()
        return self.get_profile(technician_id)

    def add_zone(self, technician_id: UUID, zone_id: UUID) -> None:
        self._require_technician(technician_id)
        if not self.repo.zone_exists(zone_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Zone not found")
        if not self.repo.add_zone_assignment(technician_id, zone_id):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Zone already assigned")

        AuditService.log_event(
            self.db,
            actor_role=UserRole.ADMIN,
            actor_id=self.current_user.user_id,
            action="admin.technician.zone_added",
            entity_type=AuditEntityType.TECHNICIAN_ZONE.value,
            entity_id=technician_id,
            metadata={"zone_id": str(zone_id)},
        )
        self.db.commit()

    def remove_zone(self, technician_id: UUID, zone_id: UUID) -> None:
        self._require_technician(technician_id)
        if not self.repo.remove_zone_assignment(technician_id, zone_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Zone assignment not found")

        AuditService.log_event(
            self.db,
            actor_role=UserRole.ADMIN,
            actor_id=self.current_user.user_id,
            action="admin.technician.zone_removed",
            entity_type=AuditEntityType.TECHNICIAN_ZONE.value,
            entity_id=technician_id,
            metadata={"zone_id": str(zone_id)},
        )
        self.db.commit()

    def add_skill(self, technician_id: UUID, skill_id: UUID) -> None:
        self._require_technician(technician_id)
        if not self.repo.skill_exists(skill_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Skill not found")
        if not self.repo.add_skill_assignment(technician_id, skill_id):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Skill already assigned")

        AuditService.log_event(
            self.db,
            actor_role=UserRole.ADMIN,
            actor_id=self.current_user.user_id,
            action="admin.technician.skill_added",
            entity_type=AuditEntityType.TECHNICIAN_SKILL.value,
            entity_id=technician_id,
            metadata={"skill_id": str(skill_id)},
        )
        self.db.commit()

    def remove_skill(self, technician_id: UUID, skill_id: UUID) -> None:
        self._require_technician(technician_id)
        if not self.repo.remove_skill_assignment(technician_id, skill_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Skill assignment not found")

        AuditService.log_event(
            self.db,
            actor_role=UserRole.ADMIN,
            actor_id=self.current_user.user_id,
            action="admin.technician.skill_removed",
            entity_type=AuditEntityType.TECHNICIAN_SKILL.value,
            entity_id=technician_id,
            metadata={"skill_id": str(skill_id)},
        )
        self.db.commit()

    def update_weekly_schedule(
        self,
        technician_id: UUID,
        items: Sequence[WeeklyScheduleUpdateItem],
    ) -> List[WeeklyScheduleResponseItem]:
        self._require_technician(technician_id)

        if len(items) != 7:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="weekly schedule must contain exactly 7 entries",
            )

        days = [item.day_of_week for item in items]
        if len(set(days)) != 7:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="weekly schedule contains duplicate day_of_week values",
            )

        payload = [
            {
                "day_of_week": item.day_of_week,
                "is_enabled": item.is_enabled,
                "start_time": item.start_time,
                "end_time": item.end_time,
            }
            for item in items
        ]
        self.repo.replace_weekly_schedule(technician_id, payload)
        audit_schedule = [
            {
                "day_of_week": item["day_of_week"],
                "is_enabled": item["is_enabled"],
                "start_time": item["start_time"].strftime("%H:%M:%S"),
                "end_time": item["end_time"].strftime("%H:%M:%S"),
            }
            for item in payload
        ]

        AuditService.log_event(
            self.db,
            actor_role=UserRole.ADMIN,
            actor_id=self.current_user.user_id,
            action="admin.technician.weekly_schedule_updated",
            entity_type=AuditEntityType.TECHNICIAN_SCHEDULE.value,
            entity_id=technician_id,
            metadata={"weekly_schedule": audit_schedule},
        )
        self.db.commit()

        return self._build_weekly_schedule(technician_id)

    def list_time_off(self, technician_id: UUID) -> List[TimeOffResponseItem]:
        self._require_technician(technician_id)

        rows = self.repo.list_non_cancelled_time_off(technician_id)
        return [
            TimeOffResponseItem(
                id=row.id,
                technician_id=row.technician_id,
                entry_type=row.entry_type,
                start_date=row.start_date,
                end_date=row.end_date,
                reason=row.reason,
                created_at=row.created_at,
                cancelled_at=row.cancelled_at,
            )
            for row in rows
        ]

    def list_zones(self) -> List[ZoneResponse]:
        return [ZoneResponse(id=zone.id, name=zone.name) for zone in self.repo.list_zones()]

    def list_skills(self) -> List[SkillResponse]:
        return [SkillResponse(id=skill.id, name=skill.name) for skill in self.repo.list_skills()]

    def create_zone(self, payload: ZoneCreateRequest) -> ZoneResponse:
        existing = self.repo.get_zone_by_name(payload.name)
        if existing is not None:
            return ZoneResponse(id=existing.id, name=existing.name)

        try:
            zone = self.repo.create_zone(payload.name)
        except IntegrityError:
            self.db.rollback()
            zone = self.repo.get_zone_by_name(payload.name)
            if zone is None:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Zone already exists")
            return ZoneResponse(id=zone.id, name=zone.name)

        self.db.commit()
        return ZoneResponse(id=zone.id, name=zone.name)

    def create_skill(self, payload: SkillCreateRequest) -> SkillResponse:
        existing = self.repo.get_skill_by_name(payload.name)
        if existing is not None:
            return SkillResponse(id=existing.id, name=existing.name)

        try:
            skill = self.repo.create_skill(payload.name)
        except IntegrityError:
            self.db.rollback()
            skill = self.repo.get_skill_by_name(payload.name)
            if skill is None:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Skill already exists")
            return SkillResponse(id=skill.id, name=skill.name)

        self.db.commit()
        return SkillResponse(id=skill.id, name=skill.name)

    def create_time_off(
        self,
        technician_id: UUID,
        payload: AdminTimeOffCreateRequest,
    ) -> TimeOffResponseItem:
        self._require_technician(technician_id)
        today = datetime.now(timezone.utc).date()

        if payload.start_date < today:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="start_date cannot be in the past",
            )

        if self.repo.has_overlapping_time_off(technician_id, payload.start_date, payload.end_date):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Time off overlaps an existing entry",
            )

        if payload.entry_type is None:
            entry_type = TimeOffEntryType.FULL_DAY if payload.start_date == payload.end_date else TimeOffEntryType.MULTI_DAY
        else:
            entry_type = payload.entry_type

        row = self.repo.create_time_off(
            technician_id,
            entry_type=entry_type.value,
            start_date=payload.start_date,
            end_date=payload.end_date,
            reason=payload.reason.strip(),
        )

        AuditService.log_event(
            self.db,
            actor_role=UserRole.ADMIN,
            actor_id=self.current_user.user_id,
            action="admin.technician.time_off_created",
            entity_type=AuditEntityType.TECHNICIAN_TIME_OFF.value,
            entity_id=row.id,
            metadata={
                "technician_id": str(technician_id),
                "entry_type": entry_type.value,
                "start_date": str(payload.start_date),
                "end_date": str(payload.end_date),
                "reason": payload.reason.strip(),
            },
        )
        self.db.commit()

        return TimeOffResponseItem(
            id=row.id,
            technician_id=row.technician_id,
            entry_type=row.entry_type,
            start_date=row.start_date,
            end_date=row.end_date,
            reason=row.reason,
            created_at=row.created_at,
            cancelled_at=row.cancelled_at,
        )

    def cancel_time_off(self, technician_id: UUID, time_off_id: UUID) -> None:
        self._require_technician(technician_id)
        row = self.repo.get_time_off_by_id_for_technician(technician_id, time_off_id)
        if row is None or row.cancelled_at is not None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Time off record not found")

        today = datetime.now(timezone.utc).date()
        if row.end_date < today:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Cannot cancel past time off records",
            )

        cancelled_at = datetime.now(timezone.utc)
        self.repo.cancel_time_off(time_off_id, cancelled_at)

        AuditService.log_event(
            self.db,
            actor_role=UserRole.ADMIN,
            actor_id=self.current_user.user_id,
            action="admin.technician.time_off_cancelled",
            entity_type=AuditEntityType.TECHNICIAN_TIME_OFF.value,
            entity_id=time_off_id,
            metadata={"technician_id": str(technician_id)},
        )
        self.db.commit()
