from uuid import uuid4

from sqlalchemy import CheckConstraint, Column, DateTime, String, Text, Uuid, text
from sqlalchemy.sql import func

from .base import Base


class Dealership(Base):
    __tablename__ = "dealerships"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    code = Column(String(32), nullable=False, unique=True)
    name = Column(String(255), nullable=False)
    phone = Column(String(64), nullable=True)
    email = Column(Text, nullable=True)
    address = Column(Text, nullable=True)
    city = Column(String(128), nullable=True)
    postal_code = Column(String(32), nullable=True)
    status = Column(String(16), nullable=False, server_default=text("'active'"))
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint("status IN ('active', 'inactive')", name="dealerships_status_chk"),
    )
