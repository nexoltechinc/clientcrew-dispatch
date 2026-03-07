from uuid import uuid4

from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, String, Text, Uuid, text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from .base import Base


class TechnicianEmailChangeRequest(Base):
    __tablename__ = "technician_email_change_requests"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    technician_id = Column(Uuid(as_uuid=True), ForeignKey("technicians.id", ondelete="CASCADE"), nullable=False)
    current_email = Column(String(255), nullable=False)
    requested_email = Column(String(255), nullable=False)
    status = Column(String(20), nullable=False, server_default=text("'PENDING'"))
    requested_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    reviewed_by = Column(Uuid(as_uuid=True), nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    remarks = Column(Text, nullable=True)
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    technician = relationship("Technician", back_populates="email_change_requests")

    __table_args__ = (
        CheckConstraint(
            "status IN ('PENDING','APPROVED','REJECTED')",
            name="technician_email_change_requests_status_chk",
        ),
    )
