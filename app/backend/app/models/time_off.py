from uuid import uuid4

from sqlalchemy import CheckConstraint, Column, Date, DateTime, ForeignKey, String, Text, Uuid, text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from .base import Base


class TimeOff(Base):
    __tablename__ = "technician_time_off"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    technician_id = Column(
        Uuid(as_uuid=True),
        ForeignKey("technicians.id", ondelete="CASCADE"),
        nullable=False,
    )
    entry_type = Column(String(64), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    reason = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    cancelled_at = Column(DateTime(timezone=True), nullable=True)

    technician = relationship("Technician", back_populates="time_off")

    __table_args__ = (
        CheckConstraint("start_date <= end_date", name="time_off_date_range_chk"),
        CheckConstraint(
            "entry_type IN ('full_day','multi_day','half_day_morning','half_day_afternoon','break')",
            name="time_off_entry_type_chk",
        ),
    )
