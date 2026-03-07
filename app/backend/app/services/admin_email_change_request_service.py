from datetime import datetime, timezone
from typing import List, Optional
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from ..core.enums import AuditEntityType, UserRole
from ..core.security import AuthenticatedUser
from ..repositories.technician_repository import TechnicianRepository
from ..schemas.technician_profile import (
    EmailChangeRequestResponse,
    EmailChangeRequestReviewRequest,
    EmailChangeRequestStatus,
)
from .audit_service import AuditService


class AdminEmailChangeRequestService:
    def __init__(self, db: Session, current_user: AuthenticatedUser):
        self.db = db
        self.current_user = current_user
        self.repo = TechnicianRepository(db)

    def _to_response(self, request_row) -> EmailChangeRequestResponse:
        technician = self.repo.get_technician_by_id(request_row.technician_id)
        technician_name = None
        if technician is not None:
            technician_name = technician.full_name or technician.name
        return EmailChangeRequestResponse(
            id=request_row.id,
            technician_id=request_row.technician_id,
            technician_name=technician_name,
            current_email=request_row.current_email,
            requested_email=request_row.requested_email,
            status=request_row.status,
            requested_at=request_row.requested_at,
            reviewed_by=request_row.reviewed_by,
            reviewed_at=request_row.reviewed_at,
            remarks=request_row.remarks,
        )

    def list_requests(self, status_filter: Optional[EmailChangeRequestStatus] = None) -> List[EmailChangeRequestResponse]:
        status_value = status_filter.value if status_filter else None
        rows = self.repo.list_email_change_requests(status=status_value)
        return [self._to_response(row) for row in rows]

    def approve_request(self, request_id: UUID, payload: EmailChangeRequestReviewRequest) -> EmailChangeRequestResponse:
        row = self.repo.get_email_change_request_by_id(request_id)
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Email change request not found")
        if row.status != EmailChangeRequestStatus.PENDING.value:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email change request is already reviewed")

        technician = self.repo.get_technician_by_id(row.technician_id)
        if technician is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Technician not found")

        existing_owner = self.repo.get_technician_by_email(row.requested_email)
        if existing_owner is not None and existing_owner.id != technician.id:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="requested_email is already in use")

        now_utc = datetime.now(timezone.utc)
        row.status = EmailChangeRequestStatus.APPROVED.value
        row.reviewed_by = self.current_user.user_id
        row.reviewed_at = now_utc
        row.remarks = payload.remarks
        self.repo.update_technician_fields(
            technician.id,
            {
                "email": row.requested_email,
                "updated_by": self.current_user.user_id,
            },
        )

        AuditService.log_event(
            self.db,
            actor_role=UserRole.ADMIN,
            actor_id=self.current_user.user_id,
            action="admin.technician.email_change.approved",
            entity_type=AuditEntityType.TECHNICIAN_EMAIL_CHANGE_REQUEST.value,
            entity_id=row.id,
            metadata={
                "technician_id": str(technician.id),
                "current_email": row.current_email,
                "requested_email": row.requested_email,
                "remarks": payload.remarks,
            },
        )
        self.db.commit()
        self.db.refresh(row)
        return self._to_response(row)

    def reject_request(self, request_id: UUID, payload: EmailChangeRequestReviewRequest) -> EmailChangeRequestResponse:
        row = self.repo.get_email_change_request_by_id(request_id)
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Email change request not found")
        if row.status != EmailChangeRequestStatus.PENDING.value:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email change request is already reviewed")

        now_utc = datetime.now(timezone.utc)
        row.status = EmailChangeRequestStatus.REJECTED.value
        row.reviewed_by = self.current_user.user_id
        row.reviewed_at = now_utc
        row.remarks = payload.remarks

        AuditService.log_event(
            self.db,
            actor_role=UserRole.ADMIN,
            actor_id=self.current_user.user_id,
            action="admin.technician.email_change.rejected",
            entity_type=AuditEntityType.TECHNICIAN_EMAIL_CHANGE_REQUEST.value,
            entity_id=row.id,
            metadata={
                "technician_id": str(row.technician_id),
                "current_email": row.current_email,
                "requested_email": row.requested_email,
                "remarks": payload.remarks,
            },
        )
        self.db.commit()
        self.db.refresh(row)
        return self._to_response(row)
