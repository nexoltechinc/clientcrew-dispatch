from typing import List
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..core.enums import AuditEntityType, UserRole
from ..core.security import AuthenticatedUser
from ..repositories.dealership_repository import DealershipRepository
from ..schemas.dealership import (
    DealershipCreateRequest,
    DealershipResponse,
    DealershipStatusUpdateRequest,
    DealershipUpdateRequest,
)
from .audit_service import AuditService


class DealershipAdminService:
    def __init__(self, db: Session, current_user: AuthenticatedUser):
        self.db = db
        self.current_user = current_user
        self.repo = DealershipRepository(db)

    def _require_dealership(self, dealership_id: UUID):
        row = self.repo.get_dealership_by_id(dealership_id)
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dealership not found")
        return row

    def _to_response(self, row) -> DealershipResponse:
        return DealershipResponse(
            id=row.id,
            code=row.code,
            name=row.name,
            phone=row.phone,
            email=row.email,
            address=row.address,
            city=row.city,
            postal_code=row.postal_code,
            status=row.status,
            notes=row.notes,
            last_job_at=None,
            recent_jobs=[],
        )

    def list_dealerships(self) -> List[DealershipResponse]:
        return [self._to_response(row) for row in self.repo.list_dealerships()]

    def get_dealership(self, dealership_id: UUID) -> DealershipResponse:
        row = self._require_dealership(dealership_id)
        return self._to_response(row)

    def create_dealership(self, payload: DealershipCreateRequest) -> DealershipResponse:
        explicit_code = payload.code.strip().upper() if payload.code else None
        if explicit_code:
            existing = self.repo.get_dealership_by_code(explicit_code)
            if existing is not None:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Dealership code already exists")

        for _ in range(3):
            code = explicit_code or self.repo.generate_next_code()
            try:
                row = self.repo.create_dealership(
                    code=code,
                    name=payload.name,
                    phone=payload.phone,
                    email=payload.email,
                    address=payload.address,
                    city=payload.city,
                    postal_code=payload.postal_code,
                    status=payload.status.value,
                    notes=payload.notes,
                )
                break
            except IntegrityError as exc:
                self.db.rollback()
                if explicit_code:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="Dealership code already exists",
                    ) from exc
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to generate unique dealership code",
            )

        AuditService.log_event(
            self.db,
            actor_role=UserRole.ADMIN,
            actor_id=self.current_user.user_id,
            action="admin.dealership.created",
            entity_type=AuditEntityType.DEALERSHIP.value,
            entity_id=row.id,
            metadata={
                "code": row.code,
                "name": row.name,
                "status": row.status,
            },
        )
        self.db.commit()
        return self._to_response(row)

    def update_dealership(self, dealership_id: UUID, payload: DealershipUpdateRequest) -> DealershipResponse:
        self._require_dealership(dealership_id)
        update_fields = payload.dict(exclude_unset=True)
        if not update_fields:
            return self.get_dealership(dealership_id)

        if "status" in update_fields and hasattr(update_fields["status"], "value"):
            update_fields["status"] = update_fields["status"].value

        row = self.repo.update_dealership_fields(dealership_id, update_fields)
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dealership not found")

        AuditService.log_event(
            self.db,
            actor_role=UserRole.ADMIN,
            actor_id=self.current_user.user_id,
            action="admin.dealership.updated",
            entity_type=AuditEntityType.DEALERSHIP.value,
            entity_id=dealership_id,
            metadata={"changes": update_fields},
        )
        self.db.commit()
        return self._to_response(row)

    def update_status(
        self,
        dealership_id: UUID,
        payload: DealershipStatusUpdateRequest,
    ) -> DealershipResponse:
        row = self._require_dealership(dealership_id)
        if row.status == payload.status.value:
            return self._to_response(row)

        updated = self.repo.update_dealership_fields(
            dealership_id,
            {"status": payload.status.value},
        )
        if updated is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dealership not found")

        AuditService.log_event(
            self.db,
            actor_role=UserRole.ADMIN,
            actor_id=self.current_user.user_id,
            action="admin.dealership.status_updated",
            entity_type=AuditEntityType.DEALERSHIP.value,
            entity_id=dealership_id,
            metadata={"status": payload.status.value},
        )
        self.db.commit()
        return self._to_response(updated)
