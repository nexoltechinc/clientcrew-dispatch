from uuid import uuid4

from sqlalchemy import Boolean, CheckConstraint, Column, DateTime, Integer, String, Uuid
from sqlalchemy.sql import func

from .base import Base


class PriorityRule(Base):
    __tablename__ = "priority_rules"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    description = Column(String(255), nullable=False)
    dealership_id = Column(String(64), nullable=False)
    service_id = Column(String(64), nullable=True)
    target_urgency = Column(String(16), nullable=False)
    ranking_score = Column(Integer, nullable=False, default=10)
    is_active = Column(Boolean, nullable=False, default=True)
    created_by = Column(String(255), nullable=True)
    updated_by = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint("target_urgency IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')", name="priority_rules_urgency_chk"),
    )
