from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from uuid import UUID
from typing import List, Optional
from datetime import datetime, timezone
import re
from ..repositories.technician_repository import TechnicianRepository
from ..models.job import Job
from ..models.technician import Technician
from .audit_service import AuditService
from fastapi import HTTPException, status

class TechnicianService:
    E164_PATTERN = re.compile(r"^\+[1-9]\d{1,14}$")

    def __init__(self, db: Session, current_user: str = "SYSTEM"):
        self.db = db
        self.repo = TechnicianRepository(db)
        self.current_user = current_user

    def _normalize_phone_e164(self, phone: str) -> str:
        candidate = phone.strip()
        candidate = re.sub(r"[^\d+]", "", candidate)
        if candidate.startswith("00"):
            candidate = "+" + candidate[2:]
        if not candidate.startswith("+"):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="phone_e164 must be in E.164 format (for example: +14165550123)",
            )
        normalized = "+" + re.sub(r"\D", "", candidate[1:])
        if not self.E164_PATTERN.match(normalized):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="phone_e164 must be in E.164 format (for example: +14165550123)",
            )
        return normalized

    def _validate_max_active_jobs(self, max_active_jobs: int):
        if max_active_jobs < 1:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="max_active_jobs must be greater than 0",
            )

    def _to_utc(self, value: datetime) -> datetime:
        if value.tzinfo is None or value.tzinfo.utcoffset(value) is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Datetime values must include timezone information",
            )
        return value.astimezone(timezone.utc)

    def get_technician(self, tech_id: UUID) -> Optional[Technician]:
        return self.repo.get_by_id(tech_id)

    def list_technicians(self, skip: int = 0, limit: int = 100) -> List[Technician]:
        return self.repo.get_all(skip, limit)

    def create_technician(self, tech_data: dict) -> Technician:
        payload = dict(tech_data)
        payload["phone_e164"] = self._normalize_phone_e164(payload["phone_e164"])
        self._validate_max_active_jobs(payload.get("max_active_jobs", 2))

        try:
            tech = self.repo.create(payload)
        except IntegrityError:
            self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Technician uniqueness constraint failed (tech_code or phone_e164)",
            )
        AuditService.log_event(
            self.db,
            actor=self.current_user,
            action="TECHNICIAN_CREATED",
            target_id=tech.id,
            target_type="TECHNICIAN",
            payload={"tech_code": tech.tech_code, "status": tech.status},
        )
        self.db.commit()
        self.db.refresh(tech)
        return tech

    def update_technician(self, tech_id: UUID, update_data: dict) -> Optional[Technician]:
        payload = dict(update_data)
        if "phone_e164" in payload and payload["phone_e164"] is not None:
            payload["phone_e164"] = self._normalize_phone_e164(payload["phone_e164"])
        if "max_active_jobs" in payload and payload["max_active_jobs"] is not None:
            self._validate_max_active_jobs(payload["max_active_jobs"])

        try:
            tech = self.repo.update(tech_id, payload)
        except IntegrityError:
            self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Technician uniqueness constraint failed (tech_code or phone_e164)",
            )
        if tech:
            AuditService.log_event(
                self.db,
                actor=self.current_user,
                action="TECHNICIAN_UPDATED",
                target_id=tech_id,
                target_type="TECHNICIAN",
                payload=payload,
            )
            self.db.commit()
            self.db.refresh(tech)
        return tech

    def update_status(self, tech_id: UUID, new_status: str) -> Optional[Technician]:
        tech = self.repo.update(tech_id, {"status": new_status})
        if tech:
            status_value = new_status.value if hasattr(new_status, "value") else str(new_status)
            AuditService.log_event(
                self.db,
                actor=self.current_user,
                action="TECHNICIAN_STATUS_CHANGED",
                target_id=tech_id,
                target_type="TECHNICIAN",
                payload={"status": status_value},
            )
            self.db.commit()
            self.db.refresh(tech)
        return tech

    def assign_skills(self, tech_id: UUID, skill_ids: List[int]):
        self.repo.assign_skills(tech_id, skill_ids)

    def assign_zones(self, tech_id: UUID, zone_ids: List[int]):
        self.repo.assign_zones(tech_id, zone_ids)

    def add_working_hours(self, tech_id: UUID, hours_data: dict):
        return self.repo.add_working_hours(tech_id, hours_data)

    def add_time_off(self, tech_id: UUID, time_off_data: dict):
        start_datetime = self._to_utc(time_off_data["start_datetime"])
        end_datetime = self._to_utc(time_off_data["end_datetime"])
        if start_datetime >= end_datetime:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="start_datetime must be earlier than end_datetime",
            )

        if self.repo.has_time_off_overlap(tech_id, start_datetime, end_datetime):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Time off overlaps with an existing time-off window",
            )

        try:
            db_time_off = self.repo.add_time_off(
                tech_id,
                {
                    "start_datetime": start_datetime,
                    "end_datetime": end_datetime,
                    "reason": time_off_data.get("reason"),
                },
            )
            AuditService.log_event(
                self.db,
                actor=self.current_user,
                action="TECHNICIAN_TIME_OFF_ADDED",
                target_id=tech_id,
                target_type="TECHNICIAN",
                payload={
                    "start_datetime": start_datetime.isoformat(),
                    "end_datetime": end_datetime.isoformat(),
                    "reason": time_off_data.get("reason"),
                },
            )
            self.db.commit()
            self.db.refresh(db_time_off)
            return db_time_off
        except IntegrityError:
            self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid technician or invalid time-off payload",
            )

    def get_eligible_technicians(self, job_id: UUID) -> List[Technician]:
        job = self.db.query(Job).filter(Job.id == job_id).first()
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        return self.repo.get_eligible_technicians(job)

    def accept_job(self, tech_id: UUID, job_id: UUID):
        """
        Transaction-safe job acceptance logic.
        """
        job = self.db.query(Job).filter(Job.id == job_id).with_for_update().first()

        if not job:
            raise HTTPException(status_code=404, detail="Job not found")

        if job.status != "READY_FOR_TECH_ACCEPTANCE":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Job is in state {job.status}, not READY_FOR_TECH_ACCEPTANCE"
            )

        # Lock technician row so concurrent accepts for the same tech serialize.
        tech = self.repo.get_by_id_for_update(tech_id)
        if not tech or tech.status != "ACTIVE":
            raise HTTPException(status_code=400, detail="Technician is not active")

        now_utc = datetime.now(timezone.utc)
        if not self.repo.is_technician_eligible_for_job(tech_id, job, now_utc=now_utc):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Technician is no longer eligible for this job",
            )

        # Check concurrent jobs again while the technician row is locked.
        active_count = (
            self.db.query(Job)
            .filter(
                Job.assigned_tech_id == tech_id,
                Job.status.in_(["ASSIGNED", "IN_PROGRESS", "DELAYED"])
            )
            .count()
        )

        if active_count >= tech.max_active_jobs:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Technician exceeded max concurrent jobs ({tech.max_active_jobs})"
            )

        # Update job
        job.assigned_tech_id = tech_id
        job.status = "ASSIGNED"
        
        AuditService.log_event(
            self.db, 
            actor=self.current_user, 
            action="JOB_ACCEPTED", 
            target_id=job_id, 
            target_type="JOB",
            payload={"tech_id": str(tech_id)}
        )

        self.db.commit()
        self.db.refresh(job)
        return job

    def reject_job(self, tech_id: UUID, job_id: UUID, reason: Optional[str] = None):
        """
        Technician rejects a broadcasted job.
        Adds to rejections table so they don't see it again.
        """
        try:
            self.repo.reject_job(tech_id, job_id, reason)
            AuditService.log_event(
                self.db,
                actor=self.current_user,
                action="JOB_REJECTED",
                target_id=job_id,
                target_type="JOB",
                payload={"tech_id": str(tech_id), "reason": reason},
            )
            self.db.commit()
        except IntegrityError:
            self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Job is already rejected by this technician",
            )

        return {"status": "success", "message": "Job rejected"}
