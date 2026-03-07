from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Any, List, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator


class InvoiceTerms(str, Enum):
    NET_15 = "NET_15"
    NET_30 = "NET_30"
    CUSTOM = "CUSTOM"


class InvoiceStatus(str, Enum):
    DRAFT = "draft"
    SENT = "sent"
    PAID = "paid"
    OVERDUE = "overdue"
    CANCELLED = "cancelled"


class InvoiceCompanyPayload(BaseModel):
    logo_url: Optional[str] = None
    name: str = Field(..., min_length=1, max_length=255)
    street_address: str = Field(..., min_length=1)
    city: str = Field(..., min_length=1, max_length=128)
    state: str = Field(..., min_length=1, max_length=128)
    zip_code: str = Field(..., min_length=1, max_length=32)
    phone: str = Field(..., min_length=1, max_length=64)
    email: str = Field(..., min_length=1, max_length=255)
    website: str = Field(..., min_length=1, max_length=255)

    @field_validator("logo_url", "name", "street_address", "city", "state", "zip_code", "phone", "email", "website")
    @classmethod
    def _normalize_strings(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class InvoicePartyPayload(BaseModel):
    name: Optional[str] = Field(default=None, max_length=255)
    street: Optional[str] = None
    city: Optional[str] = Field(default=None, max_length=128)
    state: Optional[str] = Field(default=None, max_length=128)
    zip_code: Optional[str] = Field(default=None, max_length=32)

    @field_validator("name", "street", "city", "state", "zip_code")
    @classmethod
    def _normalize_optional(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class InvoiceBillingPayload(BaseModel):
    bill_to_name: Optional[str] = Field(default=None, max_length=255)
    bill_to_address: Optional[str] = None
    bill_to_city: Optional[str] = Field(default=None, max_length=128)
    bill_to_state: Optional[str] = Field(default=None, max_length=128)
    bill_to_zip_code: Optional[str] = Field(default=None, max_length=32)
    ship_to_name: Optional[str] = Field(default=None, max_length=255)
    ship_to_address: Optional[str] = None
    ship_to_city: Optional[str] = Field(default=None, max_length=128)
    ship_to_state: Optional[str] = Field(default=None, max_length=128)
    ship_to_zip_code: Optional[str] = Field(default=None, max_length=32)

    @field_validator(
        "bill_to_name",
        "bill_to_address",
        "bill_to_city",
        "bill_to_state",
        "bill_to_zip_code",
        "ship_to_name",
        "ship_to_address",
        "ship_to_city",
        "ship_to_state",
        "ship_to_zip_code",
    )
    @classmethod
    def _normalize_optional(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class InvoiceLineItemPayload(BaseModel):
    product_service: str = Field(..., min_length=1, max_length=255)
    qb_item_id: Optional[str] = Field(default=None, max_length=64)
    description: Optional[str] = None
    quantity: Optional[Decimal] = Field(default=None, gt=0)
    qty: Optional[Decimal] = Field(default=None, gt=0)
    rate: Decimal = Field(..., ge=0)
    tax_code: str = Field(default="EXEMPT", min_length=1, max_length=32)
    tax_rate: Optional[Decimal] = Field(default=None, ge=0, le=1)
    job_id: Optional[UUID] = None

    @field_validator("product_service", "qb_item_id", "description", "tax_code")
    @classmethod
    def _normalize_text(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @model_validator(mode="before")
    @classmethod
    def _normalize_quantity_fields(cls, value: Any):
        if not isinstance(value, dict):
            return value
        payload = dict(value)
        quantity = payload.get("quantity")
        qty = payload.get("qty")
        if quantity is None and qty is not None:
            payload["quantity"] = qty
        if qty is None and quantity is not None:
            payload["qty"] = quantity
        return payload

    @model_validator(mode="after")
    def _validate_quantity(self):
        if self.quantity is None and self.qty is None:
            raise ValueError("quantity (or qty) is required")
        if self.quantity is not None and self.qty is not None and Decimal(self.quantity) != Decimal(self.qty):
            raise ValueError("quantity and qty must match when both are provided")
        if self.quantity is None and self.qty is not None:
            self.quantity = self.qty
        if self.qty is None and self.quantity is not None:
            self.qty = self.quantity
        return self


class InvoiceApprovalDraftLinePayload(BaseModel):
    product_service: str = Field(..., min_length=1, max_length=255)
    qb_item_id: Optional[str] = Field(default=None, max_length=64)
    quantity: Optional[Decimal] = Field(default=None, gt=0)
    qty: Optional[Decimal] = Field(default=None, gt=0)
    rate: Decimal = Field(..., ge=0)

    @field_validator("product_service", "qb_item_id")
    @classmethod
    def _normalize_text(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @model_validator(mode="before")
    @classmethod
    def _normalize_quantity_fields(cls, value: Any):
        if not isinstance(value, dict):
            return value
        payload = dict(value)
        quantity = payload.get("quantity")
        qty = payload.get("qty")
        if quantity is None and qty is not None:
            payload["quantity"] = qty
        if qty is None and quantity is not None:
            payload["qty"] = quantity
        return payload

    @model_validator(mode="after")
    def _validate_quantity(self):
        if self.quantity is None and self.qty is None:
            raise ValueError("quantity (or qty) is required")
        if self.quantity is not None and self.qty is not None and Decimal(self.quantity) != Decimal(self.qty):
            raise ValueError("quantity and qty must match when both are provided")
        if self.quantity is None and self.qty is not None:
            self.quantity = self.qty
        if self.qty is None and self.quantity is not None:
            self.qty = self.quantity
        return self


class InvoiceApprovalDraftSaveRequest(BaseModel):
    line_items: List[InvoiceApprovalDraftLinePayload] = Field(default_factory=list, min_length=1)


class InvoiceCreateRequest(BaseModel):
    company_info: Optional[InvoiceCompanyPayload] = None
    bill_to: Optional[InvoicePartyPayload] = None
    ship_to: Optional[InvoicePartyPayload] = None
    company: Optional[InvoiceCompanyPayload] = None
    billing: Optional[InvoiceBillingPayload] = None
    invoice_number: Optional[str] = Field(default=None, max_length=64)
    invoice_date: Optional[date] = None
    terms: InvoiceTerms = InvoiceTerms.NET_15
    custom_term_days: Optional[int] = Field(default=None, ge=0, le=3650)
    shipping: Decimal = Field(default=Decimal("0"), ge=0)
    customer_message: Optional[str] = None
    approval_note: Optional[str] = None
    status: InvoiceStatus = InvoiceStatus.DRAFT
    payment_recorded_at: Optional[datetime] = None
    dispatch_job_ids: List[UUID] = Field(default_factory=list)
    line_items: List[InvoiceLineItemPayload] = Field(default_factory=list)
    replace_dispatch_line_items: bool = False

    @field_validator("invoice_number", "customer_message", "approval_note")
    @classmethod
    def _normalize_optional_text(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @field_validator("dispatch_job_ids")
    @classmethod
    def _validate_unique_job_ids(cls, value: List[UUID]) -> List[UUID]:
        if len(value) != len(set(value)):
            raise ValueError("dispatch_job_ids must be unique")
        return value

    @model_validator(mode="after")
    def _validate_item_sources(self):
        if not self.dispatch_job_ids and not self.line_items:
            raise ValueError("invoice requires at least 1 line item or 1 completed dispatch job")
        if self.terms != InvoiceTerms.CUSTOM and self.custom_term_days is not None:
            raise ValueError("custom_term_days is only valid when terms is CUSTOM")
        if self.terms == InvoiceTerms.CUSTOM and self.custom_term_days is None:
            raise ValueError("custom_term_days is required when terms is CUSTOM")
        return self


class InvoiceUpdateRequest(BaseModel):
    company_info: Optional[InvoiceCompanyPayload] = None
    bill_to: Optional[InvoicePartyPayload] = None
    ship_to: Optional[InvoicePartyPayload] = None
    company: Optional[InvoiceCompanyPayload] = None
    billing: Optional[InvoiceBillingPayload] = None
    invoice_number: Optional[str] = Field(default=None, max_length=64)
    invoice_date: Optional[date] = None
    terms: Optional[InvoiceTerms] = None
    custom_term_days: Optional[int] = Field(default=None, ge=0, le=3650)
    shipping: Optional[Decimal] = Field(default=None, ge=0)
    customer_message: Optional[str] = None
    approval_note: Optional[str] = None
    status: Optional[InvoiceStatus] = None
    payment_recorded_at: Optional[datetime] = None
    dispatch_job_ids: Optional[List[UUID]] = None
    line_items: Optional[List[InvoiceLineItemPayload]] = None
    replace_dispatch_line_items: Optional[bool] = None

    @field_validator("invoice_number", "customer_message", "approval_note")
    @classmethod
    def _normalize_optional_text(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @field_validator("dispatch_job_ids")
    @classmethod
    def _validate_unique_job_ids(cls, value: Optional[List[UUID]]) -> Optional[List[UUID]]:
        if value is None:
            return None
        if len(value) != len(set(value)):
            raise ValueError("dispatch_job_ids must be unique")
        return value

    @model_validator(mode="after")
    def _validate_terms(self):
        if self.terms is None and self.custom_term_days is not None:
            raise ValueError("terms must be provided when custom_term_days is provided")
        if self.terms is not None and self.terms != InvoiceTerms.CUSTOM and self.custom_term_days is not None:
            raise ValueError("custom_term_days is only valid when terms is CUSTOM")
        if self.terms == InvoiceTerms.CUSTOM and self.custom_term_days is None:
            raise ValueError("custom_term_days is required when terms is CUSTOM")
        return self


class InvoiceMarkPaidRequest(BaseModel):
    payment_recorded_at: Optional[datetime] = None


class InvoiceLineItemResponse(BaseModel):
    id: UUID
    job_id: Optional[UUID] = None
    product_service: str
    qb_item_id: Optional[str] = None
    description: Optional[str] = None
    quantity: Decimal
    qty: Decimal
    rate: Decimal
    amount: Decimal
    tax_code: str
    tax_rate: Decimal
    tax_amount: Decimal
    line_order: int

    class Config:
        from_attributes = True


class InvoicePendingApprovalLineItemResponse(BaseModel):
    id: str
    description: str
    quantity: Decimal
    unit_price: Decimal
    total: Decimal


class InvoicePendingApprovalServiceResponse(BaseModel):
    id: str
    name: str
    qb_item_id: Optional[str] = None
    quantity: Decimal
    price: Decimal
    total: Decimal
    source: Optional[str] = None
    notes: Optional[str] = None


class InvoicePendingApprovalResponse(BaseModel):
    job_id: UUID
    job_code: str
    dealership_name: str
    technician_name: Optional[str] = None
    service_summary: str
    vehicle_summary: str
    completed_at: Optional[datetime] = None
    estimated_subtotal: Decimal
    estimated_sales_tax: Decimal
    estimated_total: Decimal
    invoice_state: str = "pending_approval"
    allowed_actions: List[str] = Field(default_factory=lambda: ["approve_invoice", "edit_invoice"])
    services: List[InvoicePendingApprovalServiceResponse] = Field(default_factory=list)
    items: List[InvoicePendingApprovalLineItemResponse] = Field(default_factory=list)
    bill_to: Optional[InvoicePartyPayload] = None
    ship_to: Optional[InvoicePartyPayload] = None


class InvoicePendingApprovalIssueResponse(BaseModel):
    job_id: UUID
    job_code: str
    dealership_name: str
    technician_name: Optional[str] = None
    service_summary: str
    vehicle_summary: str
    completed_at: Optional[datetime] = None
    blocking_reasons: List[str] = Field(default_factory=list)


class InvoiceResponse(BaseModel):
    id: UUID
    invoice_number: str
    job_code: Optional[str] = None
    dealership_name: Optional[str] = None
    technician_name: Optional[str] = None

    company_info: Optional[InvoiceCompanyPayload] = None
    company_logo_url: Optional[str] = None
    company_name: str
    company_street_address: str
    company_city: str
    company_state: str
    company_zip_code: str
    company_phone: str
    company_email: str
    company_website: str

    bill_to: Optional[InvoicePartyPayload] = None
    ship_to: Optional[InvoicePartyPayload] = None
    bill_to_name: str
    bill_to_address: str
    bill_to_city: Optional[str] = None
    bill_to_state: Optional[str] = None
    bill_to_zip_code: Optional[str] = None
    ship_to_name: Optional[str] = None
    ship_to_address: Optional[str] = None
    ship_to_city: Optional[str] = None
    ship_to_state: Optional[str] = None
    ship_to_zip_code: Optional[str] = None

    invoice_date: date
    terms: InvoiceTerms
    custom_term_days: Optional[int] = None
    due_date: date

    subtotal: Decimal
    sales_tax_total: Optional[Decimal] = None
    sales_tax: Decimal
    shipping: Decimal
    total: Decimal

    customer_message: Optional[str] = None
    approval_note: Optional[str] = None
    status: InvoiceStatus
    payment_recorded_at: Optional[datetime] = None
    voided_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    line_items: List[InvoiceLineItemResponse] = Field(default_factory=list)

    class Config:
        from_attributes = True
