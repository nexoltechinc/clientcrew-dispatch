from datetime import date, datetime, time
from decimal import Decimal
from typing import List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class CustomerBrandingResponse(BaseModel):
    logo_url: Optional[str] = None
    name: str
    street_address: str
    city: str
    state: str
    zip_code: str
    phone: str
    email: str
    website: str
    primary_color: str = "#2F8E92"


class CustomerServiceCatalogItemResponse(BaseModel):
    id: UUID
    code: str
    name: str
    description: Optional[str] = None
    category: str
    default_price: Decimal
    approval_required: bool
    status: str
    updated_at: datetime

    class Config:
        from_attributes = True


class CustomerServiceRequestCreateRequest(BaseModel):
    customer_name: str = Field(..., min_length=1, max_length=255)
    contact_person: str = Field(..., min_length=1, max_length=255)
    phone: Optional[str] = Field(default=None, max_length=64)
    email: Optional[str] = Field(default=None, max_length=255)
    vehicle_description: str = Field(..., min_length=1, max_length=255)
    vehicle_unit_or_stock_number: Optional[str] = Field(default=None, max_length=64)
    requested_services: List[str] = Field(default_factory=list)
    requested_service_text: Optional[str] = Field(default=None, max_length=500)
    preferred_date: date
    preferred_time: time
    service_location_or_branch: Optional[str] = Field(default=None, max_length=255)
    urgency: Literal["low", "medium", "high", "critical"] = "medium"
    special_notes: Optional[str] = Field(default=None, max_length=2000)
    portal_session_id: Optional[str] = Field(default=None, max_length=128)
    idempotency_key: Optional[str] = Field(default=None, max_length=128)
    source_channel: Literal["website_chatbot", "customer_portal", "booking_form", "status_page"] = "customer_portal"

    @field_validator(
        "customer_name",
        "contact_person",
        "phone",
        "email",
        "vehicle_description",
        "vehicle_unit_or_stock_number",
        "requested_service_text",
        "service_location_or_branch",
        "special_notes",
        "portal_session_id",
        "idempotency_key",
        "source_channel",
        mode="before",
    )
    @classmethod
    def normalize_optional_text(cls, value: object) -> object:
        if isinstance(value, str):
            stripped = value.strip()
            return stripped or None
        return value

    @field_validator("requested_services", mode="before")
    @classmethod
    def normalize_requested_services(cls, value: object) -> object:
        if value is None:
            return []
        return value


class CustomerServiceRequestResponse(BaseModel):
    request_id: UUID
    reference_number: str
    job_code: str
    status: str
    status_label: str
    summary: str
    next_step: str
    submitted_at: datetime
    customer_name: str
    service_summary: str
    vehicle_summary: str
    agent_available: bool = False


class CustomerJobLookupResult(BaseModel):
    reference_number: str
    job_code: str
    status: str
    status_label: str
    summary: str
    service_summary: str
    vehicle_summary: str
    next_step: str
    requested_service_date: Optional[date] = None
    requested_service_time: Optional[time] = None
    updated_at: datetime


class CustomerJobLookupResponse(BaseModel):
    found: bool
    multiple_matches: bool
    message: str
    query: str
    matches: List[CustomerJobLookupResult] = Field(default_factory=list)


class CustomerInvoiceLookupResult(BaseModel):
    invoice_number: str
    job_code: Optional[str] = None
    status: str
    status_label: str
    summary: str
    total: Decimal
    due_date: date
    next_step: str
    updated_at: datetime


class CustomerInvoiceLookupResponse(BaseModel):
    found: bool
    multiple_matches: bool
    message: str
    query: str
    matches: List[CustomerInvoiceLookupResult] = Field(default_factory=list)
