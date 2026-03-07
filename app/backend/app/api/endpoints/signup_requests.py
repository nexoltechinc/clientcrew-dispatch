from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ...api import deps
from ...core.enums import UserRole
from ...core.security import AuthenticatedUser
from ...schemas.signup_request import (
    TechnicianSignupDecisionRequest,
    TechnicianSignupRequestCreate,
    TechnicianSignupRequestResponse,
)
from ...services.signup_request_service import SignupRequestService

public_router = APIRouter(prefix="/auth", tags=["auth-signup-requests"])
admin_router = APIRouter(prefix="/admin/technician-signup-requests", tags=["admin-technician-signup-requests"])


@public_router.post("/technician-signup-request", response_model=TechnicianSignupRequestResponse, status_code=201)
def create_technician_signup_request(
    payload: TechnicianSignupRequestCreate,
    db: Session = Depends(deps.get_db),
):
    return SignupRequestService(db).create_request(payload)


@admin_router.get("", response_model=List[TechnicianSignupRequestResponse])
def list_technician_signup_requests(
    status: Optional[str] = Query(default=None),
    db: Session = Depends(deps.get_db),
    _: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    normalized_status = status.strip().lower() if status else None
    if normalized_status not in {None, "pending", "approved", "rejected"}:
        normalized_status = None
    return SignupRequestService(db).list_requests(normalized_status)


@admin_router.post("/{request_id}/approve", response_model=TechnicianSignupRequestResponse)
def approve_technician_signup_request(
    request_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    return SignupRequestService(db).approve_request(request_id, current_user)


@admin_router.post("/{request_id}/reject", response_model=TechnicianSignupRequestResponse)
def reject_technician_signup_request(
    request_id: UUID,
    payload: TechnicianSignupDecisionRequest,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    return SignupRequestService(db).reject_request(
        request_id,
        current_user=current_user,
        reason=payload.reason,
    )

