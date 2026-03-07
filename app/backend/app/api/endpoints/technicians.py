from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID

from ...api import deps
from ...schemas import technician as schemas
from ...services.technician_service import TechnicianService

router = APIRouter()

@router.post("/", response_model=schemas.Technician)
def create_technician(
    *,
    db: Session = Depends(deps.get_db),
    tech_in: schemas.TechnicianCreate
):
    service = TechnicianService(db)
    return service.create_technician(tech_in.dict())

@router.get("/", response_model=List[schemas.Technician])
def list_technicians(
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100
):
    service = TechnicianService(db)
    return service.list_technicians(skip=skip, limit=limit)

@router.get("/eligible/{job_id}", response_model=List[schemas.Technician])
def get_eligible_technicians(
    job_id: UUID,
    db: Session = Depends(deps.get_db)
):
    service = TechnicianService(db)
    return service.get_eligible_technicians(job_id)

@router.get("/{id}", response_model=schemas.Technician)
def get_technician(
    id: UUID,
    db: Session = Depends(deps.get_db)
):
    service = TechnicianService(db)
    tech = service.get_technician(id)
    if not tech:
        raise HTTPException(status_code=404, detail="Technician not found")
    return tech

@router.put("/{id}", response_model=schemas.Technician)
def update_technician(
    id: UUID,
    tech_in: schemas.TechnicianUpdate,
    db: Session = Depends(deps.get_db)
):
    service = TechnicianService(db)
    tech = service.update_technician(id, tech_in.dict(exclude_unset=True))
    if not tech:
        raise HTTPException(status_code=404, detail="Technician not found")
    return tech

@router.patch("/{id}/status", response_model=schemas.Technician)
def update_technician_status(
    id: UUID,
    status_in: schemas.TechnicianStatusUpdate,
    db: Session = Depends(deps.get_db)
):
    service = TechnicianService(db)
    tech = service.update_status(id, status_in.status)
    if not tech:
        raise HTTPException(status_code=404, detail="Technician not found")
    return tech

# Assignment Endpoints

@router.post("/{id}/skills")
def assign_skills(
    id: UUID,
    skill_ids: List[int],
    db: Session = Depends(deps.get_db)
):
    service = TechnicianService(db)
    service.assign_skills(id, skill_ids)
    return {"message": "Skills assigned successfully"}

@router.post("/{id}/zones")
def assign_zones(
    id: UUID,
    zone_ids: List[int],
    db: Session = Depends(deps.get_db)
):
    service = TechnicianService(db)
    service.assign_zones(id, zone_ids)
    return {"message": "Zones assigned successfully"}

@router.post("/{id}/working-hours", response_model=schemas.WorkingHours)
def add_working_hours(
    id: UUID,
    hours_in: schemas.WorkingHoursCreate,
    db: Session = Depends(deps.get_db)
):
    service = TechnicianService(db)
    return service.add_working_hours(id, hours_in.dict())

@router.post("/{id}/time-off", response_model=schemas.TimeOff)
def add_time_off(
    id: UUID,
    time_off_in: schemas.TimeOffCreate,
    db: Session = Depends(deps.get_db)
):
    service = TechnicianService(db)
    return service.add_time_off(id, time_off_in.dict())

# Job Action Endpoints

@router.post("/{id}/accept/{job_id}")
def accept_job(
    id: UUID,
    job_id: UUID,
    db: Session = Depends(deps.get_db)
):
    service = TechnicianService(db)
    job = service.accept_job(id, job_id)
    return {"message": "Job accepted", "job_id": job.id, "status": job.status}

@router.post("/{id}/reject/{job_id}")
def reject_job(
    id: UUID,
    job_id: UUID,
    rejection_in: schemas.JobRejectionCreate,
    db: Session = Depends(deps.get_db)
):
    service = TechnicianService(db)
    return service.reject_job(id, job_id, rejection_in.reason)
