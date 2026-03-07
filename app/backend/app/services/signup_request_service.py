from datetime import datetime, timezone
from typing import List, Optional
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..core.enums import AuditEntityType, TechnicianStatus, UserRole
from ..core.security import AuthenticatedUser
from ..repositories.signup_request_repository import SignupRequestRepository
from ..repositories.technician_repository import TechnicianRepository
from ..schemas.signup_request import (
    TechnicianSignupRequestCreate,
    TechnicianSignupRequestResponse,
)
from .audit_service import AuditService


class SignupRequestService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = SignupRequestRepository(db)
        self.technician_repo = TechnicianRepository(db)

    def create_request(self, payload: TechnicianSignupRequestCreate) -> TechnicianSignupRequestResponse:
        existing = self.repo.get_by_email(payload.email)
        now = datetime.now(timezone.utc)

        if existing is not None:
            if existing.status == "pending":
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Signup request already pending")
            if existing.status == "approved":
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Account already approved")
            row = self.repo.reset_as_pending(
                existing,
                name=payload.name,
                email=payload.email,
                phone=payload.phone,
                password=payload.password,
                now=now,
            )
        else:
            try:
                row = self.repo.create_request(
                    name=payload.name,
                    email=payload.email,
                    phone=payload.phone,
                    password=payload.password,
                )
            except IntegrityError as exc:
                self.db.rollback()
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already exists") from exc

        self.db.commit()
        return TechnicianSignupRequestResponse.model_validate(row)

    def list_requests(self, status_filter: Optional[str] = None) -> List[TechnicianSignupRequestResponse]:
        rows = self.repo.list_requests(status_filter)
        return [TechnicianSignupRequestResponse.model_validate(row) for row in rows]

    def approve_request(self, request_id: UUID, current_user: AuthenticatedUser) -> TechnicianSignupRequestResponse:
        row = self.repo.get_by_id(request_id)
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Signup request not found")
        if row.status != "pending":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Signup request is not pending")

        if self.technician_repo.email_exists(row.email):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Technician email already exists")

        now = datetime.now(timezone.utc)
        technician = self.technician_repo.create_technician(
            name=row.name,
            email=row.email.lower(),
            phone=row.phone,
            password=row.password,
            status=TechnicianStatus.ACTIVE.value,
            manual_availability=True,
        )
        self.repo.mark_approved(row, technician.id, now)

        AuditService.log_event(
            self.db,
            actor_role=UserRole.ADMIN,
            actor_id=current_user.user_id,
            action="admin.technician_signup_request.approved",
            entity_type=AuditEntityType.TECHNICIAN.value,
            entity_id=technician.id,
            metadata={"signup_request_id": str(row.id), "email": row.email},
        )
        self.db.commit()
        return TechnicianSignupRequestResponse.model_validate(row)

    def reject_request(
        self,
        request_id: UUID,
        *,
        current_user: AuthenticatedUser,
        reason: Optional[str] = None,
    ) -> TechnicianSignupRequestResponse:
        row = self.repo.get_by_id(request_id)
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Signup request not found")
        if row.status != "pending":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Signup request is not pending")

        now = datetime.now(timezone.utc)
        self.repo.mark_rejected(row, reason.strip() if reason else None, now)
        AuditService.log_event(
            self.db,
            actor_role=UserRole.ADMIN,
            actor_id=current_user.user_id,
            action="admin.technician_signup_request.rejected",
            entity_type=AuditEntityType.TECHNICIAN.value,
            entity_id=row.id,
            metadata={"email": row.email, "reason": reason},
        )
        self.db.commit()
        return TechnicianSignupRequestResponse.model_validate(row)

