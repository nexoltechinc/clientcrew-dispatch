from datetime import date, datetime, time
from decimal import Decimal
from enum import Enum
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field, validator

from ..core.enums import TechnicianStatus, TimeOffEntryType


class EmailChangeRequestStatus(str, Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class ZoneResponse(BaseModel):
    id: UUID
    name: str

    class Config:
        from_attributes = True


class SkillResponse(BaseModel):
    id: UUID
    name: str

    class Config:
        from_attributes = True


class ZoneCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)

    @validator("name")
    def validate_name(cls, name: str):
        normalized = name.strip()
        if not normalized:
            raise ValueError("name must not be empty")
        return normalized


class SkillCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)

    @validator("name")
    def validate_name(cls, name: str):
        normalized = name.strip()
        if not normalized:
            raise ValueError("name must not be empty")
        return normalized


class WeeklyScheduleResponseItem(BaseModel):
    day_of_week: int = Field(..., ge=0, le=6)
    is_enabled: bool
    start_time: Optional[time] = None
    end_time: Optional[time] = None

    class Config:
        from_attributes = True


class TimeOffResponseItem(BaseModel):
    id: UUID
    technician_id: UUID
    entry_type: TimeOffEntryType
    start_date: date
    end_date: date
    reason: str
    created_at: datetime
    cancelled_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class TechnicianProfileResponse(BaseModel):
    id: UUID
    name: str
    full_name: str
    email: str
    phone: Optional[str] = None
    profile_picture_url: Optional[str] = None
    status: TechnicianStatus
    manual_availability: bool
    effective_availability: bool
    on_leave_now: bool
    current_shift_window: Optional[str] = None
    next_time_off_start: Optional[date] = None
    working_days: List[int] = Field(default_factory=list)
    working_hours_start: Optional[time] = None
    working_hours_end: Optional[time] = None
    after_hours_enabled: bool = False
    has_pending_email_change_request: bool = False
    pending_email_change_request_id: Optional[UUID] = None
    pending_email_change_requested_email: Optional[str] = None
    zones: List[ZoneResponse]
    skills: List[SkillResponse]
    weekly_schedule: List[WeeklyScheduleResponseItem]
    upcoming_time_off: List[TimeOffResponseItem]


class TechnicianListItemResponse(BaseModel):
    id: UUID
    name: str
    full_name: str
    email: str
    phone: Optional[str] = None
    profile_picture_url: Optional[str] = None
    status: TechnicianStatus
    manual_availability: bool
    effective_availability: bool
    on_leave_now: bool
    current_shift_window: Optional[str] = None
    next_time_off_start: Optional[date] = None
    working_days: List[int] = Field(default_factory=list)
    working_hours_start: Optional[time] = None
    working_hours_end: Optional[time] = None
    after_hours_enabled: bool = False
    has_pending_email_change_request: bool = False
    pending_email_change_request_id: Optional[UUID] = None
    pending_email_change_requested_email: Optional[str] = None
    zones: List[ZoneResponse]
    skills: List[SkillResponse]
    current_jobs_count: int


class TechnicianUpdateRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    password: Optional[str] = None
    status: Optional[TechnicianStatus] = None
    manual_availability: Optional[bool] = None

    @validator("name")
    def validate_name(cls, name: Optional[str]):
        if name is None:
            return None
        normalized = name.strip()
        if not normalized:
            raise ValueError("name must not be empty")
        return normalized

    @validator("email")
    def validate_email(cls, email: Optional[str]):
        if email is None:
            return None
        normalized = email.strip().lower()
        if "@" not in normalized or normalized.startswith("@") or normalized.endswith("@"):
            raise ValueError("email must be valid")
        return normalized

    @validator("phone")
    def validate_phone(cls, phone: Optional[str]):
        if phone is None:
            return None
        normalized = phone.strip()
        return normalized or None

    @validator("password")
    def validate_password(cls, password: Optional[str]):
        if password is None:
            return None
        normalized = password.strip()
        if not normalized:
            raise ValueError("password must not be empty")
        return normalized


class TechnicianCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    email: str = Field(..., min_length=3, max_length=255)
    phone: Optional[str] = Field(default=None, max_length=50)
    password: Optional[str] = Field(default=None, min_length=1, max_length=255)
    status: TechnicianStatus = TechnicianStatus.ACTIVE
    manual_availability: bool = True

    @validator("email")
    def validate_email(cls, email: str):
        normalized = email.strip().lower()
        if "@" not in normalized or normalized.startswith("@") or normalized.endswith("@"):
            raise ValueError("email must be valid")
        return normalized

    @validator("name")
    def validate_name(cls, name: str):
        normalized = name.strip()
        if not normalized:
            raise ValueError("name must not be empty")
        return normalized

    @validator("phone")
    def validate_phone(cls, phone: Optional[str]):
        if phone is None:
            return None
        normalized = phone.strip()
        return normalized or None

    @validator("password")
    def validate_password_create(cls, password: Optional[str]):
        if password is None:
            return None
        normalized = password.strip()
        if not normalized:
            raise ValueError("password must not be empty")
        return normalized


class TechnicianZoneAssignRequest(BaseModel):
    zone_id: UUID


class TechnicianSkillAssignRequest(BaseModel):
    skill_id: UUID


class WeeklyScheduleUpdateItem(BaseModel):
    day_of_week: int = Field(..., ge=0, le=6)
    is_enabled: bool
    start_time: time
    end_time: time

    @validator("end_time")
    def validate_day_window(cls, end_time: time, values):
        start_time = values.get("start_time")
        if start_time is not None and end_time <= start_time:
            raise ValueError("end_time must be greater than start_time")
        return end_time


class TimeOffCreateRequest(BaseModel):
    entry_type: TimeOffEntryType
    start_date: date
    end_date: date
    reason: str = Field(..., min_length=1)

    @validator("end_date")
    def validate_date_window(cls, end_date: date, values):
        start_date = values.get("start_date")
        if start_date and end_date < start_date:
            raise ValueError("end_date must be on or after start_date")
        return end_date


class AdminTimeOffCreateRequest(BaseModel):
    start_date: date
    end_date: date
    reason: str = Field(..., min_length=1)
    entry_type: Optional[TimeOffEntryType] = None

    @validator("end_date")
    def validate_date_window(cls, end_date: date, values):
        start_date = values.get("start_date")
        if start_date and end_date < start_date:
            raise ValueError("end_date must be on or after start_date")
        return end_date


class OutOfOfficeRangeInput(BaseModel):
    start_date: date
    end_date: date
    note: Optional[str] = None

    @validator("end_date")
    def validate_date_window(cls, end_date: date, values):
        start_date = values.get("start_date")
        if start_date and end_date < start_date:
            raise ValueError("end_date must be on or after start_date")
        return end_date

    @validator("note")
    def validate_note(cls, note: Optional[str]):
        if note is None:
            return None
        normalized = note.strip()
        return normalized or None


class TechnicianAvailabilityUpdateRequest(BaseModel):
    working_days: List[int] = Field(..., min_items=1)
    working_hours_start: time
    working_hours_end: time
    after_hours_enabled: bool = False
    out_of_office_ranges: List[OutOfOfficeRangeInput] = Field(default_factory=list)

    @validator("working_days")
    def validate_working_days(cls, working_days: List[int]):
        if len(set(working_days)) != len(working_days):
            raise ValueError("working_days contains duplicates")
        for day in working_days:
            if day < 0 or day > 6:
                raise ValueError("working_days values must be between 0 and 6")
        return sorted(working_days)

    @validator("working_hours_end")
    def validate_working_window(cls, end_time: time, values):
        start_time = values.get("working_hours_start")
        if start_time is not None and end_time <= start_time:
            raise ValueError("working_hours_end must be greater than working_hours_start")
        return end_time

    @validator("out_of_office_ranges")
    def validate_out_of_office_ranges(cls, ranges: List[OutOfOfficeRangeInput]):
        sorted_ranges = sorted(ranges, key=lambda item: (item.start_date, item.end_date))
        for idx in range(1, len(sorted_ranges)):
            previous = sorted_ranges[idx - 1]
            current = sorted_ranges[idx]
            if current.start_date <= previous.end_date:
                raise ValueError("out_of_office_ranges cannot overlap")
        return sorted_ranges


class TechnicianProfileUpdateRequest(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=255)
    phone: Optional[str] = Field(default=None, max_length=50)
    profile_picture_url: Optional[str] = None

    @validator("full_name")
    def validate_full_name(cls, full_name: str):
        normalized = full_name.strip()
        if not normalized:
            raise ValueError("full_name must not be empty")
        return normalized

    @validator("phone")
    def validate_phone(cls, phone: Optional[str]):
        if phone is None:
            return None
        normalized = phone.strip()
        return normalized or None

    @validator("profile_picture_url")
    def validate_profile_picture_url(cls, profile_picture_url: Optional[str]):
        if profile_picture_url is None:
            return None
        normalized = profile_picture_url.strip()
        return normalized or None


class TechnicianPasswordChangeRequest(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=255)
    new_password: str = Field(..., min_length=6, max_length=255)

    @validator("current_password", "new_password")
    def validate_password_fields(cls, value: str):
        normalized = value.strip()
        if not normalized:
            raise ValueError("value cannot be blank")
        return normalized


class TechnicianPasswordChangeResponse(BaseModel):
    status: str
    technician_email: str
    password_changed_at: datetime


class EmailChangeRequestCreateRequest(BaseModel):
    requested_email: str = Field(..., min_length=3, max_length=255)

    @validator("requested_email")
    def validate_requested_email(cls, requested_email: str):
        normalized = requested_email.strip().lower()
        if "@" not in normalized or normalized.startswith("@") or normalized.endswith("@"):
            raise ValueError("requested_email must be valid")
        return normalized


class EmailChangeRequestReviewRequest(BaseModel):
    remarks: Optional[str] = None

    @validator("remarks")
    def validate_remarks(cls, remarks: Optional[str]):
        if remarks is None:
            return None
        normalized = remarks.strip()
        return normalized or None


class EmailChangeRequestResponse(BaseModel):
    id: UUID
    technician_id: UUID
    technician_name: Optional[str] = None
    current_email: str
    requested_email: str
    status: EmailChangeRequestStatus
    requested_at: datetime
    reviewed_by: Optional[UUID] = None
    reviewed_at: Optional[datetime] = None
    remarks: Optional[str] = None


class AssignmentReadinessResponse(BaseModel):
    technician_id: UUID
    job_id: UUID
    effective_availability: bool
    zone_match: bool
    skill_match: bool
    can_assign: bool


class TechnicianJobServiceResponse(BaseModel):
    id: str
    service_name: str
    source: str
    notes: Optional[str] = None
    quantity: Decimal
    unit_price: Decimal
    sort_order: int


class TechnicianJobFeedItem(BaseModel):
    id: UUID
    job_code: str
    status: str
    dealership_name: Optional[str] = None
    service_name: Optional[str] = None
    service_names: List[str] = Field(default_factory=list)
    service_entries: List[TechnicianJobServiceResponse] = Field(default_factory=list)
    vehicle_summary: Optional[str] = None
    zone_name: Optional[str] = None
    requested_service_date: Optional[date] = None
    requested_service_time: Optional[time] = None
    created_at: datetime
    updated_at: datetime


class TechnicianJobFeedResponse(BaseModel):
    available_jobs: List[TechnicianJobFeedItem]
    my_jobs: List[TechnicianJobFeedItem]


class TechnicianJobDelayRequest(BaseModel):
    minutes: Optional[int] = Field(default=None, ge=1, le=1440)
    note: Optional[str] = None

    @validator("note")
    def validate_note(cls, note: Optional[str]):
        if note is None:
            return None
        normalized = note.strip()
        return normalized or None


class TechnicianJobRefuseRequest(BaseModel):
    reason: Optional[str] = None
    comment: Optional[str] = None

    @validator("reason", "comment")
    def validate_text_fields(cls, value: Optional[str]):
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class TechnicianJobActionResponse(BaseModel):
    job_id: UUID
    status: str


class TechnicianJobAddServiceRequest(BaseModel):
    service_name: str = Field(..., min_length=1, max_length=255)
    notes: Optional[str] = None

    @validator("service_name")
    def validate_service_name(cls, value: str):
        normalized = value.strip()
        if not normalized:
            raise ValueError("service_name must not be empty")
        return normalized

    @validator("notes")
    def validate_notes(cls, value: Optional[str]):
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class TechnicianJobUpdateServiceRequest(BaseModel):
    service_name: str = Field(..., min_length=1, max_length=255)
    notes: Optional[str] = None

    @validator("service_name")
    def validate_service_name(cls, value: str):
        normalized = value.strip()
        if not normalized:
            raise ValueError("service_name must not be empty")
        return normalized

    @validator("notes")
    def validate_notes(cls, value: Optional[str]):
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None
