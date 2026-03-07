from datetime import datetime, timezone
from typing import List
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from ..core.enums import AuditEntityType, TimeOffEntryType, UserRole
from ..core.security import AuthenticatedUser
from ..models.technician_email_change_request import TechnicianEmailChangeRequest
from ..repositories.technician_repository import TechnicianRepository
from ..schemas.technician_profile import (
    EmailChangeRequestCreateRequest,
    EmailChangeRequestResponse,
    SkillResponse,
    TechnicianAvailabilityUpdateRequest,
    TechnicianPasswordChangeRequest,
    TechnicianPasswordChangeResponse,
    TechnicianProfileResponse,
    TechnicianProfileUpdateRequest,
    TimeOffResponseItem,
    WeeklyScheduleResponseItem,
    ZoneResponse,
)
from .audit_service import AuditService
from .availability_service import AvailabilityService


class TechnicianProfileService:
    def __init__(self, db: Session, current_user: AuthenticatedUser):
        self.db = db
        self.current_user = current_user
        self.repo = TechnicianRepository(db)
        self.availability_service = AvailabilityService(db, repository=self.repo)

    def _require_technician(self):
        technician = self.repo.get_technician_by_id(self.current_user.user_id)
        if technician is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Technician not found")
        return technician

    def _build_weekly_schedule(self, technician_id: UUID) -> List[WeeklyScheduleResponseItem]:
        rows = self.repo.list_weekly_schedule(technician_id)
        by_day = {
            row.day_of_week: WeeklyScheduleResponseItem(
                day_of_week=row.day_of_week,
                is_enabled=row.is_enabled,
                start_time=row.start_time,
                end_time=row.end_time,
            )
            for row in rows
        }
        return [
            by_day.get(
                day,
                WeeklyScheduleResponseItem(day_of_week=day, is_enabled=False, start_time=None, end_time=None),
            )
            for day in range(7)
        ]

    def _build_time_off_items(self, technician_id: UUID) -> List[TimeOffResponseItem]:
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

    def _to_email_change_response(self, row: TechnicianEmailChangeRequest) -> EmailChangeRequestResponse:
        technician = self.repo.get_technician_by_id(row.technician_id)
        technician_name = None
        if technician is not None:
            technician_name = technician.full_name or technician.name
        return EmailChangeRequestResponse(
            id=row.id,
            technician_id=row.technician_id,
            technician_name=technician_name,
            current_email=row.current_email,
            requested_email=row.requested_email,
            status=row.status,
            requested_at=row.requested_at,
            reviewed_by=row.reviewed_by,
            reviewed_at=row.reviewed_at,
            remarks=row.remarks,
        )

    def get_profile(self) -> TechnicianProfileResponse:
        technician = self._require_technician()
        technician_id = technician.id
        zones = [ZoneResponse(id=zone.id, name=zone.name) for zone in self.repo.list_technician_zones(technician_id)]
        skills = [SkillResponse(id=skill.id, name=skill.name) for skill in self.repo.list_technician_skills(technician_id)]
        pending = self.repo.get_pending_email_change_request(technician_id)
        schedule_rows = self.repo.list_weekly_schedule(technician_id)
        working_days = (
            [int(day) for day in technician.working_days]
            if isinstance(technician.working_days, list)
            else [row.day_of_week for row in schedule_rows if row.is_enabled]
        )
        start_time = technician.working_hours_start or next((row.start_time for row in schedule_rows if row.is_enabled), None)
        end_time = technician.working_hours_end or next((row.end_time for row in schedule_rows if row.is_enabled), None)

        return TechnicianProfileResponse(
            id=technician_id,
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
            has_pending_email_change_request=pending is not None,
            pending_email_change_request_id=pending.id if pending else None,
            pending_email_change_requested_email=pending.requested_email if pending else None,
            zones=zones,
            skills=skills,
            weekly_schedule=self._build_weekly_schedule(technician_id),
            upcoming_time_off=self._build_time_off_items(technician_id),
        )

    def update_profile(self, payload: TechnicianProfileUpdateRequest) -> TechnicianProfileResponse:
        technician = self._require_technician()
        before = {
            "full_name": technician.full_name or technician.name,
            "phone": technician.phone,
            "profile_picture_url": technician.profile_picture_url,
        }
        update_fields = {
            "name": payload.full_name,
            "full_name": payload.full_name,
            "phone": payload.phone,
            "profile_picture_url": payload.profile_picture_url,
            "updated_by": self.current_user.user_id,
        }
        self.repo.update_technician_fields(technician.id, update_fields)

        AuditService.log_event(
            self.db,
            actor_role=UserRole.TECHNICIAN,
            actor_id=self.current_user.user_id,
            action="technician.profile.updated",
            entity_type=AuditEntityType.TECHNICIAN.value,
            entity_id=technician.id,
            metadata={
                "before": before,
                "after": {
                    "full_name": payload.full_name,
                    "phone": payload.phone,
                    "profile_picture_url": payload.profile_picture_url,
                },
            },
        )
        self.db.commit()
        return self.get_profile()

    def update_availability(self, payload: TechnicianAvailabilityUpdateRequest) -> TechnicianProfileResponse:
        technician = self._require_technician()
        working_days = sorted(payload.working_days)
        weekly_schedule_payload = [
            {
                "day_of_week": day,
                "is_enabled": day in working_days,
                "start_time": payload.working_hours_start,
                "end_time": payload.working_hours_end,
            }
            for day in range(7)
        ]
        self.repo.replace_weekly_schedule(technician.id, weekly_schedule_payload)

        out_of_office_payload = [
            {
                "entry_type": (
                    TimeOffEntryType.FULL_DAY.value
                    if row.start_date == row.end_date
                    else TimeOffEntryType.MULTI_DAY.value
                ),
                "start_date": row.start_date,
                "end_date": row.end_date,
                "reason": row.note or "Out of office",
            }
            for row in payload.out_of_office_ranges
        ]
        self.repo.replace_out_of_office_ranges(technician.id, out_of_office_payload)
        self.repo.update_technician_fields(
            technician.id,
            {
                "working_days": working_days,
                "working_hours_start": payload.working_hours_start,
                "working_hours_end": payload.working_hours_end,
                "after_hours_enabled": payload.after_hours_enabled,
                "updated_by": self.current_user.user_id,
            },
        )

        AuditService.log_event(
            self.db,
            actor_role=UserRole.TECHNICIAN,
            actor_id=self.current_user.user_id,
            action="technician.availability.updated",
            entity_type=AuditEntityType.TECHNICIAN_SCHEDULE.value,
            entity_id=technician.id,
            metadata={
                "working_days": working_days,
                "working_hours_start": payload.working_hours_start.isoformat(),
                "working_hours_end": payload.working_hours_end.isoformat(),
                "after_hours_enabled": payload.after_hours_enabled,
                "out_of_office_ranges": [
                    {
                        "start_date": row.start_date.isoformat(),
                        "end_date": row.end_date.isoformat(),
                        "note": row.note,
                    }
                    for row in payload.out_of_office_ranges
                ],
            },
        )
        self.db.commit()
        return self.get_profile()

    def change_password(self, payload: TechnicianPasswordChangeRequest) -> TechnicianPasswordChangeResponse:
        technician = self._require_technician()

        stored_password = (technician.password or "").strip()
        current_password = payload.current_password.strip()
        if stored_password:
            if current_password != stored_password:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Current password is incorrect")
        elif current_password != "tech123":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Current password is incorrect")

        if payload.new_password == current_password:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="New password must be different from current password",
            )

        self.repo.update_technician_fields(
            technician.id,
            {
                "password": payload.new_password,
                "updated_by": self.current_user.user_id,
            },
        )

        changed_at = datetime.now(timezone.utc)
        AuditService.log_event(
            self.db,
            actor_role=UserRole.TECHNICIAN,
            actor_id=self.current_user.user_id,
            action="technician.password.updated",
            entity_type=AuditEntityType.TECHNICIAN.value,
            entity_id=technician.id,
            metadata={
                "password": "[redacted]",
                "password_changed_at": changed_at.isoformat(),
            },
        )
        self.db.commit()
        return TechnicianPasswordChangeResponse(
            status="updated",
            technician_email=technician.email,
            password_changed_at=changed_at,
        )

    def request_email_change(self, payload: EmailChangeRequestCreateRequest) -> EmailChangeRequestResponse:
        technician = self._require_technician()
        current_email = technician.email.strip().lower()
        requested_email = payload.requested_email.strip().lower()
        if requested_email == current_email:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="requested_email must be different from current email",
            )
        existing_owner = self.repo.get_technician_by_email(requested_email)
        if existing_owner is not None and existing_owner.id != technician.id:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="requested_email is already in use")
        pending = self.repo.get_pending_email_change_request(technician.id)
        if pending is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A pending email change request already exists",
            )

        row = self.repo.create_email_change_request(
            technician_id=technician.id,
            current_email=current_email,
            requested_email=requested_email,
        )
        self.repo.update_technician_fields(technician.id, {"updated_by": self.current_user.user_id})

        AuditService.log_event(
            self.db,
            actor_role=UserRole.TECHNICIAN,
            actor_id=self.current_user.user_id,
            action="technician.email_change.requested",
            entity_type=AuditEntityType.TECHNICIAN_EMAIL_CHANGE_REQUEST.value,
            entity_id=row.id,
            metadata={
                "technician_id": str(technician.id),
                "current_email": current_email,
                "requested_email": requested_email,
            },
        )
        self.db.commit()
        return self._to_email_change_response(row)

    def list_my_email_change_requests(self) -> List[EmailChangeRequestResponse]:
        self._require_technician()
        rows = self.repo.list_email_change_requests(technician_id=self.current_user.user_id)
        return [self._to_email_change_response(row) for row in rows]
