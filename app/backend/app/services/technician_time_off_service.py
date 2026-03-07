import json
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from ..core.enums import AuditEntityType, UserRole
from ..core.security import AuthenticatedUser
from ..repositories.technician_repository import TechnicianRepository
from ..schemas.technician_profile import TimeOffCreateRequest, TimeOffResponseItem
from .audit_service import AuditService


class TechnicianTimeOffService:
    def __init__(self, db: Session, current_user: AuthenticatedUser):
        self.db = db
        self.current_user = current_user
        self.repo = TechnicianRepository(db)

    def create_time_off(self, payload: TimeOffCreateRequest) -> TimeOffResponseItem:
        technician = self.repo.get_technician_by_id(self.current_user.user_id)
        if technician is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Technician not found")

        today = datetime.now(timezone.utc).date()
        if payload.start_date < today:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="start_date must be today or a future date",
            )

        if self.repo.has_overlapping_time_off(
            self.current_user.user_id,
            payload.start_date,
            payload.end_date,
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Time off overlaps an existing active entry",
            )

        row = self.repo.create_time_off(
            self.current_user.user_id,
            entry_type=payload.entry_type.value,
            start_date=payload.start_date,
            end_date=payload.end_date,
            reason=payload.reason.strip(),
        )

        AuditService.log_event(
            self.db,
            actor_role=UserRole.TECHNICIAN,
            actor_id=self.current_user.user_id,
            action="technician.time_off.created",
            entity_type=AuditEntityType.TECHNICIAN_TIME_OFF.value,
            entity_id=row.id,
            metadata={
                "technician_id": str(self.current_user.user_id),
                "entry_type": row.entry_type,
                "start_date": row.start_date.isoformat(),
                "end_date": row.end_date.isoformat(),
                "reason": row.reason,
            },
        )

        # Optional notification fan-out for admin inbox if the table exists in this deployment.
        try:
            self.repo.create_admin_notification_if_supported(
                {
                    "message": f"Technician {technician.name} created time off",
                    "metadata_json": json.dumps(
                        {
                            "technician_id": str(technician.id),
                            "time_off_id": str(row.id),
                            "entry_type": row.entry_type,
                            "start_date": row.start_date.isoformat(),
                            "end_date": row.end_date.isoformat(),
                        }
                    ),
                }
            )
        except Exception:
            # Notification support is optional and must not block core time-off persistence.
            pass

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

    def cancel_time_off(self, time_off_id: UUID) -> TimeOffResponseItem:
        row = self.repo.get_time_off_by_id_for_technician(self.current_user.user_id, time_off_id)
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Time off entry not found")
        if row.cancelled_at is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Time off already cancelled")

        today = datetime.now(timezone.utc).date()
        if row.start_date <= today:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Only future time off can be cancelled",
            )

        cancelled_at = datetime.now(timezone.utc)
        self.repo.cancel_time_off(time_off_id, cancelled_at)

        AuditService.log_event(
            self.db,
            actor_role=UserRole.TECHNICIAN,
            actor_id=self.current_user.user_id,
            action="technician.time_off.cancelled",
            entity_type=AuditEntityType.TECHNICIAN_TIME_OFF.value,
            entity_id=row.id,
            metadata={
                "technician_id": str(self.current_user.user_id),
                "start_date": row.start_date.isoformat(),
                "end_date": row.end_date.isoformat(),
                "cancelled_at": cancelled_at.isoformat(),
            },
        )

        self.db.commit()
        self.db.refresh(row)
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
