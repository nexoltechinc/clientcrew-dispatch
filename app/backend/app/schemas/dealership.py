from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field, validator

from ..core.enums import DealershipStatus


class DealershipJobSummary(BaseModel):
    id: UUID
    job_code: str
    status: str
    created_at: datetime
    assigned_tech: Optional[str] = None


class DealershipResponse(BaseModel):
    id: UUID
    code: str
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    postal_code: Optional[str] = None
    status: DealershipStatus
    notes: Optional[str] = None
    last_job_at: Optional[datetime] = None
    recent_jobs: List[DealershipJobSummary] = Field(default_factory=list)

    class Config:
        from_attributes = True


class DealershipCreateRequest(BaseModel):
    code: Optional[str] = Field(default=None, max_length=32)
    name: str = Field(..., min_length=1, max_length=255)
    phone: Optional[str] = Field(default=None, max_length=64)
    email: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = Field(default=None, max_length=128)
    postal_code: Optional[str] = Field(default=None, max_length=32)
    status: DealershipStatus = DealershipStatus.ACTIVE
    notes: Optional[str] = None

    @validator("code")
    def validate_code(cls, value: Optional[str]):
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            return None
        return normalized

    @validator("name")
    def validate_name(cls, value: str):
        normalized = value.strip()
        if not normalized:
            raise ValueError("name must not be empty")
        return normalized

    @validator("phone", "email", "address", "city", "postal_code", "notes")
    def normalize_optional_strings(cls, value: Optional[str]):
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class DealershipUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, max_length=255)
    phone: Optional[str] = Field(default=None, max_length=64)
    email: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = Field(default=None, max_length=128)
    postal_code: Optional[str] = Field(default=None, max_length=32)
    status: Optional[DealershipStatus] = None
    notes: Optional[str] = None

    @validator("name")
    def validate_name(cls, value: Optional[str]):
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            raise ValueError("name must not be empty")
        return normalized

    @validator("phone", "email", "address", "city", "postal_code", "notes")
    def normalize_optional_strings(cls, value: Optional[str]):
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class DealershipStatusUpdateRequest(BaseModel):
    status: DealershipStatus
