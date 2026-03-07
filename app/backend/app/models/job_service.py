from uuid import uuid4

from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Integer, Numeric, String, Text, Uuid, text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from .base import Base


class JobService(Base):
    __tablename__ = "job_services"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    job_id = Column(Uuid(as_uuid=True), ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    service_catalog_id = Column(Uuid(as_uuid=True), ForeignKey("service_catalog.id"), nullable=True)
    service_name_snapshot = Column(String(255), nullable=False)
    source = Column(String(20), nullable=False, server_default=text("'dealership'"))
    notes = Column(Text, nullable=True)
    quantity = Column(Numeric(10, 2), nullable=False, server_default=text("1"))
    unit_price = Column(Numeric(12, 2), nullable=False, server_default=text("0"))
    sort_order = Column(Integer, nullable=False, server_default=text("0"))
    created_by_user_id = Column(Uuid(as_uuid=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    job = relationship("Job", back_populates="job_services")
    service_catalog = relationship("ServiceCatalog")

    __table_args__ = (
        CheckConstraint(
            "source IN ('dealership','admin','technician')",
            name="job_services_source_chk",
        ),
        CheckConstraint("quantity >= 0", name="job_services_quantity_non_negative_chk"),
        CheckConstraint("unit_price >= 0", name="job_services_unit_price_non_negative_chk"),
    )
