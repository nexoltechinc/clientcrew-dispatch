from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ...api import deps
from ...core.enums import UserRole
from ...core.security import AuthenticatedUser
from ...schemas.technician_profile import TimeOffCreateRequest, TimeOffResponseItem
from ...services.technician_time_off_service import TechnicianTimeOffService

router = APIRouter(prefix="/technician/time-off", tags=["technician-time-off"])


@router.post("", response_model=TimeOffResponseItem)
def create_technician_time_off(
    payload: TimeOffCreateRequest,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.TECHNICIAN)),
):
    return TechnicianTimeOffService(db, current_user).create_time_off(payload)


@router.delete("/{time_off_id}", response_model=TimeOffResponseItem)
def cancel_technician_time_off(
    time_off_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.TECHNICIAN)),
):
    return TechnicianTimeOffService(db, current_user).cancel_time_off(time_off_id)
