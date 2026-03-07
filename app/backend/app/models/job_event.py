from uuid import uuid4

from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, JSON, String, Uuid
from sqlalchemy.sql import func

from .base import Base


class JobEvent(Base):
    __tablename__ = "job_events"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    job_id = Column(Uuid(as_uuid=True), ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    event_type = Column(String(64), nullable=False)
    actor_type = Column(String(20), nullable=False)
    payload_json = Column("payload", JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        CheckConstraint("actor_type IN ('SYSTEM','ADMIN','TECHNICIAN')", name="job_events_actor_type_chk"),
    )
