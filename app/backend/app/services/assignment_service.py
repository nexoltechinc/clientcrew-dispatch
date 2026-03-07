from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from ..repositories.technician_repository import TechnicianRepository
from ..schemas.technician_profile import AssignmentReadinessResponse
from .availability_service import AvailabilityService


class AssignmentService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = TechnicianRepository(db)
        self.availability = AvailabilityService(db, repository=self.repo)

    def check_assignment_readiness(self, technician_id: UUID, job_id: UUID) -> AssignmentReadinessResponse:
        technician = self.repo.get_technician_by_id(technician_id)
        if technician is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Technician not found")

        job = self.repo.get_job_by_id(job_id)
        if job is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

        effective_availability = self.availability.compute_effective_availability(technician_id)
        zone_match = self.repo.has_zone_match(technician_id, job.zone_id)
        skill_match = self.repo.has_skill_match(technician_id, job.skill_id)
        can_assign = effective_availability and zone_match and skill_match

        return AssignmentReadinessResponse(
            technician_id=technician_id,
            job_id=job_id,
            effective_availability=effective_availability,
            zone_match=zone_match,
            skill_match=skill_match,
            can_assign=can_assign,
        )

    def assert_can_assign(self, technician_id: UUID, job_id: UUID) -> None:
        readiness = self.check_assignment_readiness(technician_id, job_id)
        if not readiness.can_assign:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "message": "Technician does not satisfy assignment prerequisites",
                    "effective_availability": readiness.effective_availability,
                    "zone_match": readiness.zone_match,
                    "skill_match": readiness.skill_match,
                },
            )
