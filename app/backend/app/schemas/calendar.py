from datetime import datetime
from typing import List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field, validator


CalendarEventType = Literal[
    "appointment",
    "service_job",
    "delivery",
    "technician_schedule",
    "reminder",
    "urgent",
]

CalendarPriority = Literal["low", "normal", "high", "urgent"]


class CalendarEventActivityEntry(BaseModel):
    timestamp: datetime
    actor_role: str
    message: str


class CalendarEventCreateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    event_type: CalendarEventType
    customer_name: Optional[str] = None
    location: Optional[str] = None
    assigned_technician_id: Optional[UUID] = None
    start_at: datetime
    end_at: datetime
    description: Optional[str] = None
    priority: CalendarPriority = "normal"
    attachments: List[str] = Field(default_factory=list)
    reminder_email: bool = False
    reminder_sms: bool = False
    reminder_dashboard: bool = True
    internal_notes: Optional[str] = None

    @validator("title", "customer_name", "location", "description", "internal_notes", pre=True)
    def normalize_optional_text(cls, value):
        if value is None:
            return None
        if not isinstance(value, str):
            return value
        normalized = value.strip()
        return normalized or None

    @validator("attachments", pre=True)
    def normalize_attachments(cls, value):
        if value is None:
            return []
        if not isinstance(value, list):
            raise ValueError("attachments must be a list")
        normalized: list[str] = []
        for item in value:
            if not isinstance(item, str):
                raise ValueError("attachments must contain strings")
            trimmed = item.strip()
            if trimmed:
                normalized.append(trimmed)
        return normalized


class CalendarEventUpdateRequest(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    event_type: Optional[CalendarEventType] = None
    customer_name: Optional[str] = None
    location: Optional[str] = None
    assigned_technician_id: Optional[UUID] = None
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    description: Optional[str] = None
    priority: Optional[CalendarPriority] = None
    attachments: Optional[List[str]] = None
    reminder_email: Optional[bool] = None
    reminder_sms: Optional[bool] = None
    reminder_dashboard: Optional[bool] = None
    internal_notes: Optional[str] = None

    @validator("title", "customer_name", "location", "description", "internal_notes", pre=True)
    def normalize_optional_text(cls, value):
        if value is None:
            return None
        if not isinstance(value, str):
            return value
        normalized = value.strip()
        return normalized or None

    @validator("attachments", pre=True)
    def normalize_attachments(cls, value):
        if value is None:
            return None
        if not isinstance(value, list):
            raise ValueError("attachments must be a list")
        normalized: list[str] = []
        for item in value:
            if not isinstance(item, str):
                raise ValueError("attachments must contain strings")
            trimmed = item.strip()
            if trimmed:
                normalized.append(trimmed)
        return normalized


class CalendarEventScheduleUpdateRequest(BaseModel):
    start_at: datetime
    end_at: datetime
    assigned_technician_id: Optional[UUID] = None


class CalendarEventAddNoteRequest(BaseModel):
    note: str = Field(..., min_length=1, max_length=2000)

    @validator("note")
    def normalize_note(cls, value: str):
        normalized = value.strip()
        if not normalized:
            raise ValueError("note must not be blank")
        return normalized


class CalendarEventResponse(BaseModel):
    id: UUID
    title: str
    event_type: CalendarEventType
    customer_name: Optional[str] = None
    location: Optional[str] = None
    assigned_technician_id: Optional[UUID] = None
    assigned_technician_name: Optional[str] = None
    start_at: datetime
    end_at: datetime
    description: Optional[str] = None
    priority: CalendarPriority
    attachments: List[str] = Field(default_factory=list)
    reminder_email: bool
    reminder_sms: bool
    reminder_dashboard: bool
    internal_notes: Optional[str] = None
    activity_log: List[CalendarEventActivityEntry] = Field(default_factory=list)
    created_by_role: str
    created_at: datetime
    updated_at: datetime
