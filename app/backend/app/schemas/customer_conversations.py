from __future__ import annotations

from datetime import date, datetime, time
from decimal import Decimal
from typing import Any, Dict, List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


ConversationSourceChannel = Literal["website_chatbot", "customer_portal", "booking_form", "status_page"]
ConversationStatus = Literal[
    "bot_active",
    "waiting_for_agent",
    "agent_joined",
    "intake_created",
    "converted_to_job",
    "waiting_for_customer",
    "closed",
    "escalated",
    "missed",
]
ConversationUrgency = Literal["low", "normal", "high", "urgent"]
ConversationSenderType = Literal["bot", "customer", "admin", "system"]
IntakeStatus = Literal["new", "reviewed", "converted", "closed"]
IntakeSourceSystem = Literal["customer_chatbot", "customer_portal", "booking_form", "status_page"]


class CustomerConversationSourceMetadata(BaseModel):
    portal_session_id: Optional[str] = None
    idempotency_key: Optional[str] = None
    request_type: Optional[str] = None
    raw_request: Optional[Dict[str, Any]] = None


class CustomerConversationListItemResponse(BaseModel):
    id: UUID
    reference_number: str
    source_channel: ConversationSourceChannel
    status: ConversationStatus
    urgency: ConversationUrgency
    customer_name: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    requested_service: Optional[str] = None
    matched_service_name: Optional[str] = None
    last_message_preview: Optional[str] = None
    assigned_admin_label: Optional[str] = None
    created_at: datetime
    last_activity_at: datetime
    unread_count: int
    dealership_name: Optional[str] = None
    dealership_status: Optional[str] = None
    linked_job_code: Optional[str] = None
    linked_intake_number: Optional[str] = None
    is_inactive_account_warning: bool = False
    is_service_match_ambiguous: bool = False

    class Config:
        from_attributes = True


class CustomerConversationMessageResponse(BaseModel):
    id: UUID
    conversation_id: UUID
    sender_type: ConversationSenderType
    sender_label: Optional[str] = None
    message_kind: str
    body: str
    attachment_url: Optional[str] = None
    attachment_name: Optional[str] = None
    attachment_mime_type: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    delivered_at: Optional[datetime] = None
    read_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class CustomerConversationNoteResponse(BaseModel):
    id: UUID
    conversation_id: UUID
    author_admin_id: UUID
    author_admin_label: Optional[str] = None
    note_body: str
    created_at: datetime

    class Config:
        from_attributes = True


class CustomerConversationServiceMatchCandidateResponse(BaseModel):
    id: UUID
    code: str
    name: str
    category: str
    default_price: Decimal
    approval_required: bool
    status: str

    class Config:
        from_attributes = True


class CustomerConversationCustomerProfileResponse(BaseModel):
    dealership_id: Optional[UUID] = None
    dealership_name: Optional[str] = None
    dealership_status: Optional[str] = None
    customer_name: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    account_warning: Optional[str] = None
    matched_job_code: Optional[str] = None
    matched_intake_number: Optional[str] = None


class CustomerConversationCollectedFieldsResponse(BaseModel):
    requested_service_text: Optional[str] = None
    matched_service_id: Optional[UUID] = None
    matched_service_name: Optional[str] = None
    matched_service_candidates: List[CustomerConversationServiceMatchCandidateResponse] = Field(default_factory=list)
    preferred_date: Optional[date] = None
    preferred_time: Optional[time] = None
    service_location_or_branch: Optional[str] = None
    vehicle_description: Optional[str] = None
    vehicle_unit_or_stock_number: Optional[str] = None
    urgency: ConversationUrgency = "normal"
    special_notes: Optional[str] = None


class CustomerConversationIntakeResponse(BaseModel):
    id: UUID
    intake_number: str
    source_system: IntakeSourceSystem
    status: IntakeStatus
    conversation_id: Optional[UUID] = None
    dealership_id: Optional[UUID] = None
    customer_name: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    requested_service_text: Optional[str] = None
    matched_service_id: Optional[UUID] = None
    matched_service_name: Optional[str] = None
    vehicle_description: Optional[str] = None
    vehicle_unit_or_stock_number: Optional[str] = None
    preferred_date: Optional[date] = None
    preferred_time: Optional[time] = None
    location_branch: Optional[str] = None
    urgency: ConversationUrgency = "normal"
    notes: Optional[str] = None
    linked_job_id: Optional[UUID] = None
    created_by_admin_id: Optional[UUID] = None
    created_by_admin_label: Optional[str] = None
    updated_by_admin_id: Optional[UUID] = None
    updated_by_admin_label: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CustomerConversationJobLinkResponse(BaseModel):
    job_id: UUID
    job_code: str
    status: str
    dealership_id: Optional[UUID] = None
    dealership_name: Optional[str] = None
    service_type: Optional[str] = None
    vehicle: Optional[str] = None
    requested_service_date: Optional[date] = None
    requested_service_time: Optional[time] = None


class CustomerConversationDetailResponse(CustomerConversationListItemResponse):
    customer_profile: CustomerConversationCustomerProfileResponse
    collected_fields: CustomerConversationCollectedFieldsResponse
    messages: List[CustomerConversationMessageResponse] = Field(default_factory=list)
    internal_notes: List[CustomerConversationNoteResponse] = Field(default_factory=list)
    linked_intake: Optional[CustomerConversationIntakeResponse] = None
    linked_job: Optional[CustomerConversationJobLinkResponse] = None
    allowed_actions: List[str] = Field(default_factory=list)
    source_metadata: Optional[Dict[str, Any]] = None


class CustomerConversationSummaryResponse(BaseModel):
    total: int
    unread: int
    waiting_for_agent: int
    agent_joined: int
    intake_created: int
    converted_to_job: int
    waiting_for_customer: int
    escalated: int
    missed: int
    urgent: int


class CustomerConversationReplyRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    attachment_url: Optional[str] = Field(default=None, max_length=2000)
    attachment_name: Optional[str] = Field(default=None, max_length=255)
    attachment_mime_type: Optional[str] = Field(default=None, max_length=128)

    @field_validator("message", "attachment_url", "attachment_name", "attachment_mime_type")
    @classmethod
    def _normalize_optional_text(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class CustomerConversationAssignmentRequest(BaseModel):
    assigned_agent_label: Optional[str] = Field(default=None, max_length=255)
    assign_to_me: bool = False
    clear_assignment: bool = False

    @field_validator("assigned_agent_label")
    @classmethod
    def _normalize_label(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class CustomerConversationStatusUpdateRequest(BaseModel):
    status: ConversationStatus
    reason: Optional[str] = Field(default=None, max_length=1000)

    @field_validator("reason")
    @classmethod
    def _normalize_reason(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class CustomerConversationNoteCreateRequest(BaseModel):
    note_body: str = Field(..., min_length=1, max_length=4000)

    @field_validator("note_body")
    @classmethod
    def _normalize_body(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("note_body cannot be blank")
        return normalized


class CustomerConversationIntakeUpsertRequest(BaseModel):
    status: IntakeStatus = "new"
    customer_name: Optional[str] = Field(default=None, max_length=255)
    contact_person: Optional[str] = Field(default=None, max_length=255)
    phone: Optional[str] = Field(default=None, max_length=64)
    email: Optional[str] = Field(default=None, max_length=255)
    requested_service_text: Optional[str] = Field(default=None, max_length=4000)
    matched_service_id: Optional[UUID] = None
    matched_service_name: Optional[str] = Field(default=None, max_length=255)
    vehicle_description: Optional[str] = None
    vehicle_unit_or_stock_number: Optional[str] = Field(default=None, max_length=64)
    preferred_date: Optional[date] = None
    preferred_time: Optional[time] = None
    location_branch: Optional[str] = Field(default=None, max_length=255)
    urgency: ConversationUrgency = "normal"
    notes: Optional[str] = None

    @field_validator(
        "customer_name",
        "contact_person",
        "phone",
        "email",
        "requested_service_text",
        "matched_service_name",
        "vehicle_description",
        "vehicle_unit_or_stock_number",
        "location_branch",
        "notes",
    )
    @classmethod
    def _normalize_optional_text(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class CustomerConversationLinkIntakeRequest(BaseModel):
    intake_id: Optional[UUID] = None
    intake_number: Optional[str] = Field(default=None, max_length=64)

    @field_validator("intake_number")
    @classmethod
    def _normalize_number(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class CustomerConversationLinkJobRequest(BaseModel):
    job_id: Optional[UUID] = None
    job_code: Optional[str] = Field(default=None, max_length=50)

    @field_validator("job_code")
    @classmethod
    def _normalize_code(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class CustomerConversationConvertToJobRequest(BaseModel):
    dealership_name: Optional[str] = Field(default=None, max_length=255)
    service_name: Optional[str] = Field(default=None, max_length=255)
    service_names: List[str] = Field(default_factory=list)
    vehicle_summary: Optional[str] = Field(default=None, max_length=255)
    requested_service_date: Optional[date] = None
    requested_service_time: Optional[time] = None
    pre_assigned_technician_id: Optional[UUID] = None
    notes: Optional[str] = Field(default=None, max_length=4000)
    create_intake_first: bool = True

    @field_validator("dealership_name", "service_name", "vehicle_summary", "notes")
    @classmethod
    def _normalize_optional_text(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @field_validator("service_names", mode="before")
    @classmethod
    def _normalize_service_names(cls, value: object) -> object:
        if value is None:
            return []
        return value
