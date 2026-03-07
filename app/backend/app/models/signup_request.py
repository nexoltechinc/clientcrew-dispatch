from uuid import uuid4

from sqlalchemy import Column, DateTime, ForeignKey, String, Text, Uuid, text
from sqlalchemy.sql import func

from .base import Base


class SignupRequest(Base):
    __tablename__ = "technician_signup_requests"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=False, unique=True)
    phone = Column(String(50), nullable=True)
    password = Column(String(255), nullable=False)
    status = Column(String(20), nullable=False, server_default=text("'pending'"))
    requested_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
    approved_technician_id = Column(Uuid(as_uuid=True), ForeignKey("technicians.id"), nullable=True)
    rejection_reason = Column(Text, nullable=True)

