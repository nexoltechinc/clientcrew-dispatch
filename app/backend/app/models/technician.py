from uuid import uuid4

from sqlalchemy import JSON, Boolean, CheckConstraint, Column, DateTime, Integer, String, Text, Time, Uuid, text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from .base import Base


class Technician(Base):
    __tablename__ = "technicians"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    name = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=True)
    email = Column(String(255), nullable=False, unique=True)
    phone = Column(String(50), nullable=True)
    profile_picture_url = Column(Text, nullable=True)
    working_days = Column(JSON, nullable=False, server_default=text("'[]'"))
    working_hours_start = Column(Time, nullable=True)
    working_hours_end = Column(Time, nullable=True)
    after_hours_enabled = Column(Boolean, nullable=False, server_default=text("false"))
    password = Column(String(255), nullable=True)
    status = Column(String(20), nullable=False, server_default=text("'active'"))
    priority_rank = Column(Integer, nullable=False, server_default=text("100"))
    manual_availability = Column(Boolean, nullable=False, server_default=text("true"))
    updated_by = Column(Uuid(as_uuid=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    zones = relationship("Zone", secondary="technician_zones", back_populates="technicians")
    skills = relationship("Skill", secondary="technician_skills", back_populates="technicians")
    working_hours = relationship(
        "WorkingHours",
        back_populates="technician",
        cascade="all, delete-orphan",
    )
    time_off = relationship(
        "TimeOff",
        back_populates="technician",
        cascade="all, delete-orphan",
    )
    rejections = relationship("JobRejection", back_populates="technician")
    email_change_requests = relationship(
        "TechnicianEmailChangeRequest",
        back_populates="technician",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('active','deactivated')",
            name="technicians_status_chk",
        ),
        CheckConstraint(
            "(working_hours_start IS NULL AND working_hours_end IS NULL) OR "
            "(working_hours_start IS NOT NULL AND working_hours_end IS NOT NULL AND working_hours_end > working_hours_start)",
            name="technicians_working_hours_window_chk",
        ),
    )
