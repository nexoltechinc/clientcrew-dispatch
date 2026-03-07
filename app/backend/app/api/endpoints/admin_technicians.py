from typing import Dict, List
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ...api import deps
from ...core.enums import UserRole
from ...core.security import AuthenticatedUser
from ...schemas.technician_profile import (
    AdminTimeOffCreateRequest,
    AssignmentReadinessResponse,
    SkillCreateRequest,
    SkillResponse,
    TechnicianCreateRequest,
    TechnicianListItemResponse,
    TechnicianProfileResponse,
    TechnicianSkillAssignRequest,
    TechnicianUpdateRequest,
    TechnicianJobFeedResponse,
    TechnicianZoneAssignRequest,
    TimeOffResponseItem,
    WeeklyScheduleResponseItem,
    WeeklyScheduleUpdateItem,
    ZoneCreateRequest,
    ZoneResponse,
)
from ...services.assignment_service import AssignmentService
from ...services.technician_jobs_service import TechnicianJobsService
from ...services.technician_admin_service import TechnicianAdminService

router = APIRouter(prefix="/admin/technicians", tags=["admin-technicians"])


@router.get("", response_model=List[TechnicianListItemResponse])
def list_admin_technicians(
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    return TechnicianAdminService(db, current_user).list_technicians()


@router.post("", response_model=TechnicianProfileResponse, status_code=201)
def create_admin_technician(
    payload: TechnicianCreateRequest,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    return TechnicianAdminService(db, current_user).create_technician(payload)


@router.get("/zones/catalog", response_model=List[ZoneResponse])
def list_zone_catalog(
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    return TechnicianAdminService(db, current_user).list_zones()


@router.post("/zones/catalog", response_model=ZoneResponse, status_code=201)
def create_zone_catalog_entry(
    payload: ZoneCreateRequest,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    return TechnicianAdminService(db, current_user).create_zone(payload)


@router.get("/skills/catalog", response_model=List[SkillResponse])
def list_skill_catalog(
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    return TechnicianAdminService(db, current_user).list_skills()


@router.post("/skills/catalog", response_model=SkillResponse, status_code=201)
def create_skill_catalog_entry(
    payload: SkillCreateRequest,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    return TechnicianAdminService(db, current_user).create_skill(payload)


@router.get("/{technician_id}", response_model=TechnicianProfileResponse)
def get_admin_technician_profile(
    technician_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    return TechnicianAdminService(db, current_user).get_profile(technician_id)


@router.put("/{technician_id}", response_model=TechnicianProfileResponse)
def update_admin_technician_profile(
    technician_id: UUID,
    payload: TechnicianUpdateRequest,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    return TechnicianAdminService(db, current_user).update_technician(technician_id, payload)


@router.post("/{technician_id}/zones", response_model=Dict[str, str])
def add_technician_zone(
    technician_id: UUID,
    payload: TechnicianZoneAssignRequest,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    TechnicianAdminService(db, current_user).add_zone(technician_id, payload.zone_id)
    return {"status": "ok"}


@router.delete("/{technician_id}/zones/{zone_id}", response_model=Dict[str, str])
def remove_technician_zone(
    technician_id: UUID,
    zone_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    TechnicianAdminService(db, current_user).remove_zone(technician_id, zone_id)
    return {"status": "ok"}


@router.post("/{technician_id}/skills", response_model=Dict[str, str])
def add_technician_skill(
    technician_id: UUID,
    payload: TechnicianSkillAssignRequest,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    TechnicianAdminService(db, current_user).add_skill(technician_id, payload.skill_id)
    return {"status": "ok"}


@router.delete("/{technician_id}/skills/{skill_id}", response_model=Dict[str, str])
def remove_technician_skill(
    technician_id: UUID,
    skill_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    TechnicianAdminService(db, current_user).remove_skill(technician_id, skill_id)
    return {"status": "ok"}


@router.put("/{technician_id}/weekly-schedule", response_model=List[WeeklyScheduleResponseItem])
def update_technician_weekly_schedule(
    technician_id: UUID,
    payload: List[WeeklyScheduleUpdateItem],
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    return TechnicianAdminService(db, current_user).update_weekly_schedule(technician_id, payload)


@router.get("/{technician_id}/time-off", response_model=List[TimeOffResponseItem])
def list_admin_technician_time_off(
    technician_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    return TechnicianAdminService(db, current_user).list_time_off(technician_id)


@router.post("/{technician_id}/time-off", response_model=TimeOffResponseItem, status_code=201)
def create_admin_technician_time_off(
    technician_id: UUID,
    payload: AdminTimeOffCreateRequest,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    return TechnicianAdminService(db, current_user).create_time_off(technician_id, payload)


@router.delete("/{technician_id}/time-off/{time_off_id}", response_model=Dict[str, str])
def cancel_admin_technician_time_off(
    technician_id: UUID,
    time_off_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    TechnicianAdminService(db, current_user).cancel_time_off(technician_id, time_off_id)
    return {"status": "ok"}


@router.get(
    "/{technician_id}/assignment-readiness/{job_id}",
    response_model=AssignmentReadinessResponse,
)
def get_assignment_readiness(
    technician_id: UUID,
    job_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    return AssignmentService(db).check_assignment_readiness(technician_id, job_id)


@router.get("/{technician_id}/jobs-feed", response_model=TechnicianJobFeedResponse)
def get_admin_technician_jobs_feed(
    technician_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    return TechnicianJobsService(db).get_job_feed(technician_id)
