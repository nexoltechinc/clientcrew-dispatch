from uuid import uuid4

from sqlalchemy import Boolean, CheckConstraint, Column, DateTime, Numeric, String, Text, Uuid, text
from sqlalchemy.sql import func

from .base import Base


class ServiceCatalog(Base):
    __tablename__ = "service_catalog"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    qb_item_id = Column(String(64), nullable=True, unique=True)
    code = Column(String(128), nullable=False, unique=True)
    name = Column(String(255), nullable=False)
    sku = Column(String(128), nullable=True)
    description = Column(Text, nullable=True)
    qb_type = Column(String(64), nullable=True)
    category = Column(String(128), nullable=False, server_default=text("'General'"))
    default_price = Column(Numeric(12, 2), nullable=False, server_default=text("0"))
    approval_required = Column(Boolean, nullable=False, server_default=text("false"))
    status = Column(String(16), nullable=False, server_default=text("'active'"))
    notes = Column(Text, nullable=True)
    updated_by = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint("status IN ('active', 'archived')", name="service_catalog_status_chk"),
    )
