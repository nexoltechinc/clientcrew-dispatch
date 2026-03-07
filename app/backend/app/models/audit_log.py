from uuid import uuid4

from sqlalchemy import CheckConstraint, Column, DateTime, JSON, String, Uuid
from sqlalchemy.sql import func

from .base import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    actor_role = Column(String(20), nullable=False)
    actor_id = Column(Uuid(as_uuid=True), nullable=False)
    action = Column(String(100), nullable=False)
    entity_type = Column(String(64), nullable=False)
    entity_id = Column(Uuid(as_uuid=True), nullable=False)
    metadata_json = Column("metadata", JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        CheckConstraint("actor_role IN ('admin','technician')", name="audit_logs_actor_role_chk"),
    )
