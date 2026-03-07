from typing import Dict, List
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.orm import aliased

from ...api import deps
from ...core.enums import JobWorkflowStatus, UserRole
from ...core.job_status import DispatchJobStatus, db_status_from_dispatch_status, normalize_dispatch_job_status
from ...core.security import AuthenticatedUser
from ...models.dealership import Dealership
from ...models.invoice import InvoiceLineItem
from ...models.job import Job
from ...models.technician import Technician
from ...schemas.admin_jobs import (
    AdminJobAssignmentUpdateRequest,
    AdminJobCreateRequest,
    AdminJobListItemResponse,
    AdminJobUpdateRequest,
)
from ...services.job_services_service import JobServicesService
from ...services.pre_assignment_service import PreAssignmentService

router = APIRouter(prefix="/admin/jobs", tags=["admin-jobs"])


def _generate_manual_job_code(db: Session) -> str:
    for _ in range(10):
        candidate = f"SM2-NEW-{uuid4().hex[:6].upper()}"
        existing = db.query(Job.id).filter(Job.job_code == candidate).first()
        if existing is None:
            return candidate
    raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Could not generate job code")


def _serialize_admin_job_row(db: Session, job_row: Job) -> AdminJobListItemResponse:
    assigned_technician = None
    if job_row.assigned_tech_id is not None:
        assigned_technician = db.query(Technician).filter(Technician.id == job_row.assigned_tech_id).first()

    pre_assigned_technician = None
    if job_row.pre_assigned_technician_id is not None:
        pre_assigned_technician = db.query(Technician).filter(Technician.id == job_row.pre_assigned_technician_id).first()

    dealership = None
    if job_row.dealership_id is not None:
        dealership = db.query(Dealership).filter(Dealership.id == job_row.dealership_id).first()

    job_services_service = JobServicesService(db)
    service_rows = job_services_service.list_service_rows(job_row)
    service_names = job_services_service.list_service_names(job_row)

    return AdminJobListItemResponse(
        id=job_row.id,
        job_code=job_row.job_code,
        status=normalize_dispatch_job_status(job_row.status).value,
        dealership_id=job_row.dealership_id,
        dealership_name=dealership.name if dealership is not None else None,
        assigned_technician_id=job_row.assigned_tech_id,
        assigned_technician_name=assigned_technician.name if assigned_technician is not None else None,
        pre_assigned_technician_id=job_row.pre_assigned_technician_id,
        pre_assigned_technician_name=pre_assigned_technician.name if pre_assigned_technician is not None else None,
        pre_assignment_reason=job_row.pre_assignment_reason,
        service_type=service_names[0] if service_names else job_row.service_type,
        service_names=service_names,
        service_entries=job_services_service.serialize_service_rows(service_rows),
        vehicle=job_row.vehicle,
        created_at=job_row.created_at,
        updated_at=job_row.updated_at,
        requested_service_date=job_row.requested_service_date,
        requested_service_time=job_row.requested_service_time,
        source_system=job_row.source_system,
        source_metadata=job_row.source_metadata,
    )


@router.post("", response_model=AdminJobListItemResponse, status_code=status.HTTP_201_CREATED)
def create_admin_job(
    payload: AdminJobCreateRequest,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    try:
        normalized_service_names = JobServicesService(db)._normalize_service_names(
            [candidate for candidate in [payload.service_name, *(payload.service_names or [])] if candidate is not None]
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    dealership = (
        db.query(Dealership)
        .filter(Dealership.name == payload.dealership_name)
        .first()
    )
    if dealership is None:
        dealership = (
            db.query(Dealership)
            .filter(Dealership.code == payload.dealership_name)
            .first()
        )

    pre_assigned_technician = None
    if payload.pre_assigned_technician_id is not None:
        pre_assigned_technician = (
            db.query(Technician)
            .filter(Technician.id == payload.pre_assigned_technician_id)
            .first()
        )
        if pre_assigned_technician is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Technician not found")
        if pre_assigned_technician.status != "active":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Technician is not active")

    requested_job_code = payload.job_code
    if requested_job_code:
        existing = db.query(Job.id).filter(Job.job_code == requested_job_code).first()
        if existing is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Job code already exists")
    resolved_job_code = requested_job_code or _generate_manual_job_code(db)

    job_row = Job(
        job_code=resolved_job_code,
        status=db_status_from_dispatch_status(DispatchJobStatus.ADMIN_PREVIEW),
        dealership_id=dealership.id if dealership is not None else None,
        customer_name=dealership.name if dealership is not None else None,
        service_type=normalized_service_names[0],
        vehicle=payload.vehicle_summary,
        pre_assigned_technician_id=payload.pre_assigned_technician_id,
        pre_assignment_reason="manual_admin_assignment" if pre_assigned_technician is not None else None,
        requested_service_date=payload.requested_service_date,
        requested_service_time=payload.requested_service_time,
        location=(dealership.city.strip() if dealership is not None and dealership.city else None),
        source_system="admin_ui",
        source_metadata={
            "source": "admin_ui",
            "manual_entry": True,
            "dealership_name_input": payload.dealership_name,
            "created_by_role": "admin",
        },
    )
    db.add(job_row)
    JobServicesService(db).replace_services(
        job=job_row,
        service_names=normalized_service_names,
        source="admin",
        created_by_user_id=current_user.user_id,
    )
    db.commit()
    db.refresh(job_row)

    return _serialize_admin_job_row(db, job_row)


@router.get("", response_model=List[AdminJobListItemResponse])
def list_admin_jobs(
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    pre_assigned_technician_alias = aliased(Technician)
    # Explicitly join related names so the frontend can render backend-created jobs
    # (including Make.com ingested jobs) without local mock lookups.
    rows = (
        db.query(Job, Dealership, Technician, pre_assigned_technician_alias)
        .outerjoin(Dealership, Dealership.id == Job.dealership_id)
        .outerjoin(Technician, Technician.id == Job.assigned_tech_id)
        .outerjoin(pre_assigned_technician_alias, pre_assigned_technician_alias.id == Job.pre_assigned_technician_id)
        .order_by(Job.created_at.desc(), Job.job_code.desc())
        .all()
    )

    return [_serialize_admin_job_row(db, job) for job, dealership, technician, pre_assigned_technician in rows]


@router.patch("/{job_id}", response_model=AdminJobListItemResponse)
def update_admin_job(
    job_id: UUID,
    payload: AdminJobUpdateRequest,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    job_row = db.query(Job).filter(Job.id == job_id).first()
    if job_row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    normalized_status = normalize_dispatch_job_status(job_row.status)
    if normalized_status in {DispatchJobStatus.CANCELLED, DispatchJobStatus.COMPLETED}:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Completed/cancelled jobs cannot be edited")

    if payload.dealership_name is not None:
        dealership = (
            db.query(Dealership).filter(Dealership.name == payload.dealership_name).first()
            or db.query(Dealership).filter(Dealership.code == payload.dealership_name).first()
        )
        job_row.dealership_id = dealership.id if dealership is not None else None
        job_row.customer_name = dealership.name if dealership is not None else payload.dealership_name
        job_row.location = (dealership.city.strip() if dealership is not None and dealership.city else None)
        metadata = dict(job_row.source_metadata) if isinstance(job_row.source_metadata, dict) else {}
        metadata["dealership_name_input"] = payload.dealership_name
        job_row.source_metadata = metadata

    if payload.service_name is not None or payload.service_names is not None:
        try:
            next_service_names = JobServicesService(db)._normalize_service_names(
                [candidate for candidate in [payload.service_name, *(payload.service_names or [])] if candidate is not None]
            )
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
        JobServicesService(db).replace_services(
            job=job_row,
            service_names=next_service_names,
            source="admin",
            created_by_user_id=current_user.user_id,
        )

    if payload.vehicle_summary is not None:
        job_row.vehicle = payload.vehicle_summary
    if payload.requested_service_date is not None:
        job_row.requested_service_date = payload.requested_service_date
    if payload.requested_service_time is not None:
        job_row.requested_service_time = payload.requested_service_time

    db.commit()
    db.refresh(job_row)

    return _serialize_admin_job_row(db, job_row)


@router.delete("/{job_id}", response_model=Dict[str, str])
def delete_admin_job(
    job_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    row = db.query(Job).filter(Job.id == job_id).first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    linked_invoice_line = db.query(InvoiceLineItem.id).filter(InvoiceLineItem.job_id == job_id).first()
    if linked_invoice_line is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Job cannot be removed because it is linked to invoice line items",
        )

    db.delete(row)
    db.commit()
    return {"status": "ok"}


@router.patch("/{job_id}/assignment", response_model=AdminJobListItemResponse)
def update_admin_job_assignment(
    job_id: UUID,
    payload: AdminJobAssignmentUpdateRequest,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    job_row = db.query(Job).filter(Job.id == job_id).first()
    if job_row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    normalized_status = normalize_dispatch_job_status(job_row.status)
    if normalized_status in {DispatchJobStatus.CANCELLED, DispatchJobStatus.COMPLETED}:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Completed/cancelled jobs cannot be assigned")

    assigned_technician = None
    if payload.assigned_technician_id is not None:
        assigned_technician = db.query(Technician).filter(Technician.id == payload.assigned_technician_id).first()
        if assigned_technician is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Technician not found")
        if assigned_technician.status != "active":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Technician is not active")

    job_row.assigned_tech_id = payload.assigned_technician_id
    # Prevent "ghost jobs": a scheduled job must never remain unassigned.
    if payload.assigned_technician_id is None and normalized_status == DispatchJobStatus.SCHEDULED:
        job_row.status = db_status_from_dispatch_status(DispatchJobStatus.PENDING)
    db.commit()
    db.refresh(job_row)

    return _serialize_admin_job_row(db, job_row)


@router.post("/{job_id}/pre-assign", response_model=AdminJobListItemResponse)
def pre_assign_job_technician(
    job_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    job_row = PreAssignmentService(db).pre_assign_technician(job_id)
    return _serialize_admin_job_row(db, job_row)


@router.post("/{job_id}/confirm", response_model=AdminJobListItemResponse)
def confirm_admin_job(
    job_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    job_row = db.query(Job).filter(Job.id == job_id).first()
    if job_row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    normalized_status = normalize_dispatch_job_status(job_row.status)
    if normalized_status in {DispatchJobStatus.CANCELLED, DispatchJobStatus.COMPLETED}:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Completed/cancelled jobs cannot be confirmed")

    if job_row.assigned_tech_id is None and job_row.pre_assigned_technician_id is not None:
        job_row.assigned_tech_id = job_row.pre_assigned_technician_id
    elif job_row.assigned_tech_id is None and job_row.pre_assigned_technician_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Assign a technician before confirming this job.",
        )

    # Confirmed jobs must leave admin review pipeline.
    if normalized_status in {
        DispatchJobStatus.ADMIN_PREVIEW,
        DispatchJobStatus.READY_FOR_TECH,
        DispatchJobStatus.PENDING_ADMIN_CONFIRMATION,
        DispatchJobStatus.PENDING_REVIEW,
    }:
        job_row.status = db_status_from_dispatch_status(DispatchJobStatus.SCHEDULED)

    db.commit()
    db.refresh(job_row)

    return _serialize_admin_job_row(db, job_row)


@router.post("/{job_id}/sync-location", response_model=AdminJobListItemResponse)
def sync_admin_job_location_from_dealership(
    job_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    job_row = db.query(Job).filter(Job.id == job_id).first()
    if job_row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    dealership = db.query(Dealership).filter(Dealership.id == job_row.dealership_id).first()
    current_location = (job_row.location or "").strip()
    dealership_city = (dealership.city if dealership is not None and dealership.city is not None else "").strip()

    # Idempotent DB-first fallback: if job location is empty, persist dealership city.
    if not current_location and dealership_city:
        job_row.location = dealership_city
        db.commit()
        db.refresh(job_row)

    return _serialize_admin_job_row(db, job_row)
