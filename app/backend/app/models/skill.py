from uuid import uuid4

from sqlalchemy import Column, ForeignKey, String, Table, Uuid
from sqlalchemy.orm import relationship

from .base import Base

technician_skills = Table(
    "technician_skills",
    Base.metadata,
    Column("technician_id", Uuid(as_uuid=True), ForeignKey("technicians.id", ondelete="CASCADE"), primary_key=True),
    Column("skill_id", Uuid(as_uuid=True), ForeignKey("skills.id", ondelete="CASCADE"), primary_key=True),
)


class Skill(Base):
    __tablename__ = "skills"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    name = Column(String(255), unique=True, nullable=False)

    technicians = relationship("Technician", secondary=technician_skills, back_populates="skills")
