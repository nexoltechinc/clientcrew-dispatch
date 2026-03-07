from uuid import uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    String,
    Text,
    Uuid,
    text,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from .base import Base


class CalendarEvent(Base):
    __tablename__ = "calendar_events"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    title = Column(String(255), nullable=False)
    event_type = Column(String(50), nullable=False)
    customer_name = Column(String(255), nullable=True)
    location = Column(Text, nullable=True)
    assigned_technician_id = Column(Uuid(as_uuid=True), ForeignKey("technicians.id"), nullable=True)
    start_at = Column(DateTime(timezone=True), nullable=False)
    end_at = Column(DateTime(timezone=True), nullable=False)
    description = Column(Text, nullable=True)
    priority = Column(String(20), nullable=False, server_default=text("'normal'"))
    attachments = Column(JSON, nullable=False, server_default=text("'[]'"))
    reminder_email = Column(Boolean, nullable=False, server_default=text("false"))
    reminder_sms = Column(Boolean, nullable=False, server_default=text("false"))
    reminder_dashboard = Column(Boolean, nullable=False, server_default=text("true"))
    internal_notes = Column(Text, nullable=True)
    activity_log = Column(JSON, nullable=False, server_default=text("'[]'"))
    created_by_role = Column(String(20), nullable=False, server_default=text("'admin'"))
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    assigned_technician = relationship("Technician")

    __table_args__ = (
        CheckConstraint(
            "event_type IN ('appointment','service_job','delivery','technician_schedule','reminder','urgent')",
            name="calendar_events_event_type_chk",
        ),
        CheckConstraint(
            "priority IN ('low','normal','high','urgent')",
            name="calendar_events_priority_chk",
        ),
        CheckConstraint(
            "end_at > start_at",
            name="calendar_events_time_window_chk",
        ),
    )
