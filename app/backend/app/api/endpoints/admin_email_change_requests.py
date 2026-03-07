from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ...api import deps
from ...core.enums import UserRole
from ...core.security import AuthenticatedUser
from ...schemas.technician_profile import (
    EmailChangeRequestResponse,
    EmailChangeRequestReviewRequest,
    EmailChangeRequestStatus,
)
from ...services.admin_email_change_request_service import AdminEmailChangeRequestService

router = APIRouter(prefix="/admin/email-change-requests", tags=["admin-email-change-requests"])


@router.get("", response_model=List[EmailChangeRequestResponse])
def list_email_change_requests(
    status: Optional[EmailChangeRequestStatus] = Query(default=None),
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    return AdminEmailChangeRequestService(db, current_user).list_requests(status)


@router.post("/{request_id}/approve", response_model=EmailChangeRequestResponse)
def approve_email_change_request(
    request_id: UUID,
    payload: EmailChangeRequestReviewRequest,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    return AdminEmailChangeRequestService(db, current_user).approve_request(request_id, payload)


@router.post("/{request_id}/reject", response_model=EmailChangeRequestResponse)
def reject_email_change_request(
    request_id: UUID,
    payload: EmailChangeRequestReviewRequest,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    return AdminEmailChangeRequestService(db, current_user).reject_request(request_id, payload)
