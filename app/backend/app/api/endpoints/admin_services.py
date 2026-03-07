from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ...api import deps
from ...core.enums import UserRole
from ...core.security import AuthenticatedUser
from ...schemas.admin_services import (
    AdminServiceCreateRequest,
    AdminServiceResponse,
    AdminServiceStatusUpdateRequest,
    AdminServiceUpdateRequest,
)
from ...services.service_catalog_service import ServiceCatalogService

router = APIRouter(prefix="/admin/services", tags=["admin-services"])
catalog_router = APIRouter(prefix="/services", tags=["services"])


@router.get("", response_model=List[AdminServiceResponse])
def list_admin_services(
    include_archived: bool = True,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    return ServiceCatalogService(db, current_user).list_admin_services(
        include_archived=include_archived,
    )


@router.post("", response_model=AdminServiceResponse, status_code=201)
def create_admin_service(
    payload: AdminServiceCreateRequest,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    return ServiceCatalogService(db, current_user).create_service(payload)


@router.put("/{service_id}", response_model=AdminServiceResponse)
def update_admin_service(
    service_id: UUID,
    payload: AdminServiceUpdateRequest,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    return ServiceCatalogService(db, current_user).update_service(service_id, payload)


@router.patch("/{service_id}/status", response_model=AdminServiceResponse)
def update_admin_service_status(
    service_id: UUID,
    payload: AdminServiceStatusUpdateRequest,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    return ServiceCatalogService(db, current_user).update_status(service_id, payload)


@catalog_router.get("", response_model=List[AdminServiceResponse])
def list_services_catalog(
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN, UserRole.TECHNICIAN)),
):
    return ServiceCatalogService(db, current_user).list_active_services()
