from uuid import uuid4

from sqlalchemy import (
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    Uuid,
    text,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from .base import Base


class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    invoice_number = Column(String(64), nullable=False, unique=True, index=True)

    company_logo_url = Column(Text, nullable=True)
    company_name = Column(String(255), nullable=False)
    company_street_address = Column(Text, nullable=False)
    company_city = Column(String(128), nullable=False)
    company_state = Column(String(128), nullable=False)
    company_zip_code = Column(String(32), nullable=False)
    company_phone = Column(String(64), nullable=False)
    company_email = Column(String(255), nullable=False)
    company_website = Column(String(255), nullable=False)

    bill_to_name = Column(String(255), nullable=False)
    bill_to_address = Column(Text, nullable=False)
    bill_to_city = Column(String(128), nullable=True)
    bill_to_state = Column(String(128), nullable=True)
    bill_to_zip_code = Column(String(32), nullable=True)

    ship_to_name = Column(String(255), nullable=True)
    ship_to_address = Column(Text, nullable=True)
    ship_to_city = Column(String(128), nullable=True)
    ship_to_state = Column(String(128), nullable=True)
    ship_to_zip_code = Column(String(32), nullable=True)

    invoice_date = Column(Date, nullable=False)
    terms = Column(String(32), nullable=False, server_default=text("'NET_15'"))
    custom_term_days = Column(Integer, nullable=True)
    due_date = Column(Date, nullable=False)

    subtotal = Column(Numeric(12, 2), nullable=False, server_default=text("0"))
    sales_tax = Column(Numeric(12, 2), nullable=False, server_default=text("0"))
    shipping = Column(Numeric(12, 2), nullable=False, server_default=text("0"))
    total = Column(Numeric(12, 2), nullable=False, server_default=text("0"))

    customer_message = Column(Text, nullable=True)
    approval_note = Column(Text, nullable=True)
    status = Column(String(16), nullable=False, server_default=text("'draft'"))
    payment_recorded_at = Column(DateTime(timezone=True), nullable=True)
    voided_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    line_items = relationship(
        "InvoiceLineItem",
        back_populates="invoice",
        cascade="all, delete-orphan",
        order_by="InvoiceLineItem.line_order",
    )
    jobs = relationship("Job", back_populates="invoice")

    __table_args__ = (
        CheckConstraint("status IN ('draft','sent','paid','overdue','cancelled')", name="invoices_status_chk"),
        CheckConstraint("subtotal >= 0", name="invoices_subtotal_non_negative_chk"),
        CheckConstraint("sales_tax >= 0", name="invoices_sales_tax_non_negative_chk"),
        CheckConstraint("shipping >= 0", name="invoices_shipping_non_negative_chk"),
        CheckConstraint("total >= 0", name="invoices_total_non_negative_chk"),
        CheckConstraint("custom_term_days IS NULL OR custom_term_days >= 0", name="invoices_custom_term_days_chk"),
    )


class InvoiceLineItem(Base):
    __tablename__ = "invoice_line_items"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    invoice_id = Column(Uuid(as_uuid=True), ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False)
    job_id = Column(Uuid(as_uuid=True), ForeignKey("jobs.id"), nullable=True)

    product_service = Column(String(255), nullable=False)
    qb_item_id = Column(String(64), nullable=True)
    description = Column(Text, nullable=True)
    quantity = Column(Numeric(10, 2), nullable=False)
    rate = Column(Numeric(12, 2), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    tax_code = Column(String(32), nullable=False, server_default=text("'EXEMPT'"))
    tax_rate = Column(Numeric(8, 5), nullable=False, server_default=text("0"))
    tax_amount = Column(Numeric(12, 2), nullable=False, server_default=text("0"))
    line_order = Column(Integer, nullable=False, server_default=text("0"))

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    invoice = relationship("Invoice", back_populates="line_items")

    __table_args__ = (
        CheckConstraint("quantity >= 0", name="invoice_line_items_quantity_non_negative_chk"),
        CheckConstraint("rate >= 0", name="invoice_line_items_rate_non_negative_chk"),
        CheckConstraint("amount >= 0", name="invoice_line_items_amount_non_negative_chk"),
        CheckConstraint("tax_rate >= 0", name="invoice_line_items_tax_rate_non_negative_chk"),
        CheckConstraint("tax_amount >= 0", name="invoice_line_items_tax_amount_non_negative_chk"),
    )
