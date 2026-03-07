from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ...api import deps
from ...core.enums import UserRole
from ...core.security import AuthenticatedUser
from ...schemas.technician_profile import (
    EmailChangeRequestCreateRequest,
    EmailChangeRequestResponse,
    TechnicianPasswordChangeRequest,
    TechnicianPasswordChangeResponse,
    TechnicianJobActionResponse,
    TechnicianJobAddServiceRequest,
    TechnicianJobDelayRequest,
    TechnicianAvailabilityUpdateRequest,
    TechnicianJobFeedItem,
    TechnicianJobRefuseRequest,
    TechnicianJobUpdateServiceRequest,
    TechnicianProfileResponse,
    TechnicianProfileUpdateRequest,
    TechnicianJobFeedResponse,
)
from ...services.technician_jobs_service import TechnicianJobsService
from ...services.technician_profile_service import TechnicianProfileService

router = APIRouter(prefix="/technicians/me", tags=["technician-profile"])


@router.get("", response_model=TechnicianProfileResponse)
def get_my_profile(
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.TECHNICIAN)),
):
    return TechnicianProfileService(db, current_user).get_profile()


@router.put("", response_model=TechnicianProfileResponse)
def update_my_profile(
    payload: TechnicianProfileUpdateRequest,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.TECHNICIAN)),
):
    return TechnicianProfileService(db, current_user).update_profile(payload)


@router.put("/availability", response_model=TechnicianProfileResponse)
def update_my_availability(
    payload: TechnicianAvailabilityUpdateRequest,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.TECHNICIAN)),
):
    return TechnicianProfileService(db, current_user).update_availability(payload)


@router.post("/password", response_model=TechnicianPasswordChangeResponse)
def change_my_password(
    payload: TechnicianPasswordChangeRequest,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.TECHNICIAN)),
):
    return TechnicianProfileService(db, current_user).change_password(payload)


@router.post("/email-change-request", response_model=EmailChangeRequestResponse, status_code=201)
def request_email_change(
    payload: EmailChangeRequestCreateRequest,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.TECHNICIAN)),
):
    return TechnicianProfileService(db, current_user).request_email_change(payload)


@router.get("/email-change-requests", response_model=List[EmailChangeRequestResponse])
def list_my_email_change_requests(
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.TECHNICIAN)),
):
    return TechnicianProfileService(db, current_user).list_my_email_change_requests()


@router.get("/jobs-feed", response_model=TechnicianJobFeedResponse)
def get_my_jobs_feed(
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.TECHNICIAN)),
):
    return TechnicianJobsService(db).get_job_feed(current_user.user_id)


@router.post("/jobs/{job_id}/start", response_model=TechnicianJobActionResponse)
def start_my_job(
    job_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.TECHNICIAN)),
):
    row = TechnicianJobsService(db).start_my_job(current_user.user_id, job_id)
    return TechnicianJobActionResponse(job_id=row.id, status=row.status)


@router.post("/jobs/{job_id}/accept", response_model=TechnicianJobActionResponse)
def accept_my_job(
    job_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.TECHNICIAN)),
):
    row = TechnicianJobsService(db).accept_my_job(current_user.user_id, job_id)
    return TechnicianJobActionResponse(job_id=row.id, status=row.status)


@router.post("/jobs/{job_id}/complete", response_model=TechnicianJobActionResponse)
def complete_my_job(
    job_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.TECHNICIAN)),
):
    row = TechnicianJobsService(db).complete_my_job(current_user.user_id, job_id)
    return TechnicianJobActionResponse(job_id=row.id, status=row.status)


@router.post("/jobs/{job_id}/delay", response_model=TechnicianJobActionResponse)
def delay_my_job(
    job_id: UUID,
    payload: TechnicianJobDelayRequest,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.TECHNICIAN)),
):
    row = TechnicianJobsService(db).delay_my_job(
        current_user.user_id,
        job_id,
        minutes=payload.minutes,
        note=payload.note,
    )
    return TechnicianJobActionResponse(job_id=row.id, status=row.status)


@router.post("/jobs/{job_id}/refuse", response_model=TechnicianJobActionResponse)
def refuse_my_job(
    job_id: UUID,
    payload: TechnicianJobRefuseRequest,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.TECHNICIAN)),
):
    row = TechnicianJobsService(db).refuse_my_job(
        current_user.user_id,
        job_id,
        reason=payload.reason,
        comment=payload.comment,
    )
    return TechnicianJobActionResponse(job_id=row.id, status=row.status)


@router.post("/jobs/{job_id}/services", response_model=TechnicianJobFeedItem, status_code=201)
def add_service_to_my_job(
    job_id: UUID,
    payload: TechnicianJobAddServiceRequest,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.TECHNICIAN)),
):
    row = TechnicianJobsService(db).add_service_to_my_job(
        current_user.user_id,
        job_id,
        service_name=payload.service_name,
        notes=payload.notes,
    )
    feed = TechnicianJobsService(db).get_job_feed(current_user.user_id)
    for item in [*feed.my_jobs, *feed.available_jobs]:
        if item.id == row.id:
            return item
    raise RuntimeError("Updated job not found in technician feed")


@router.patch("/jobs/{job_id}/services/{service_id}", response_model=TechnicianJobFeedItem)
def update_service_on_my_job(
    job_id: UUID,
    service_id: UUID,
    payload: TechnicianJobUpdateServiceRequest,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.TECHNICIAN)),
):
    row = TechnicianJobsService(db).update_service_on_my_job(
        current_user.user_id,
        job_id,
        service_id=service_id,
        service_name=payload.service_name,
        notes=payload.notes,
    )
    feed = TechnicianJobsService(db).get_job_feed(current_user.user_id)
    for item in [*feed.my_jobs, *feed.available_jobs]:
        if item.id == row.id:
            return item
    raise RuntimeError("Updated job not found in technician feed")


@router.delete("/jobs/{job_id}/services/{service_id}", response_model=TechnicianJobFeedItem)
def remove_service_from_my_job(
    job_id: UUID,
    service_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.TECHNICIAN)),
):
    row = TechnicianJobsService(db).remove_service_from_my_job(
        current_user.user_id,
        job_id,
        service_id=service_id,
    )
    feed = TechnicianJobsService(db).get_job_feed(current_user.user_id)
    for item in [*feed.my_jobs, *feed.available_jobs]:
        if item.id == row.id:
            return item
    raise RuntimeError("Updated job not found in technician feed")
