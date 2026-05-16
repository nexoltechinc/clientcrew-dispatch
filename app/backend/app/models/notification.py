from uuid import uuid4

from sqlalchemy import CheckConstraint, Column, DateTime, JSON, String, Text, Uuid
from sqlalchemy.sql import func

from .base import Base


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    recipient_role = Column(String(20), nullable=False)
    recipient_user_id = Column(Uuid(as_uuid=True), nullable=True)
    message = Column(Text, nullable=False)
    metadata_json = Column("metadata", JSON, nullable=True)
    read_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        CheckConstraint("recipient_role IN ('admin','technician')", name="notifications_recipient_role_chk"),
    )
