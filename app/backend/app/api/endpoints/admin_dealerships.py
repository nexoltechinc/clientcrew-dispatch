from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ...api import deps
from ...core.enums import UserRole
from ...core.security import AuthenticatedUser
from ...schemas.dealership import (
    DealershipCreateRequest,
    DealershipResponse,
    DealershipStatusUpdateRequest,
    DealershipUpdateRequest,
)
from ...services.dealership_admin_service import DealershipAdminService

router = APIRouter(prefix="/admin/dealerships", tags=["admin-dealerships"])


@router.get("", response_model=List[DealershipResponse])
def list_admin_dealerships(
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    return DealershipAdminService(db, current_user).list_dealerships()


@router.post("", response_model=DealershipResponse, status_code=201)
def create_admin_dealership(
    payload: DealershipCreateRequest,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    return DealershipAdminService(db, current_user).create_dealership(payload)


@router.get("/{dealership_id}", response_model=DealershipResponse)
def get_admin_dealership(
    dealership_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    return DealershipAdminService(db, current_user).get_dealership(dealership_id)


@router.put("/{dealership_id}", response_model=DealershipResponse)
def update_admin_dealership(
    dealership_id: UUID,
    payload: DealershipUpdateRequest,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    return DealershipAdminService(db, current_user).update_dealership(dealership_id, payload)


@router.patch("/{dealership_id}/status", response_model=DealershipResponse)
def update_admin_dealership_status(
    dealership_id: UUID,
    payload: DealershipStatusUpdateRequest,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    return DealershipAdminService(db, current_user).update_status(dealership_id, payload)
