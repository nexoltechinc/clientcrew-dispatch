from uuid import uuid4

from sqlalchemy import Column, DateTime, ForeignKey, JSON, Uuid
from sqlalchemy.sql import func

from .base import Base


class InvoiceApprovalDraft(Base):
    __tablename__ = "invoice_approval_drafts"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    job_id = Column(Uuid(as_uuid=True), ForeignKey("jobs.id"), nullable=False, unique=True, index=True)
    line_items = Column(JSON, nullable=False, default=list)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
