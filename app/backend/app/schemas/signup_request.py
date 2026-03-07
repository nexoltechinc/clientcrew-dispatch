from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field, validator


class TechnicianSignupRequestCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    email: str = Field(..., min_length=3, max_length=255)
    phone: Optional[str] = Field(default=None, max_length=50)
    password: str = Field(..., min_length=1, max_length=255)

    @validator("name")
    def validate_name(cls, value: str):
        normalized = value.strip()
        if not normalized:
            raise ValueError("name must not be empty")
        return normalized

    @validator("email")
    def validate_email(cls, value: str):
        normalized = value.strip().lower()
        if "@" not in normalized or normalized.startswith("@") or normalized.endswith("@"):
            raise ValueError("email must be valid")
        return normalized

    @validator("phone")
    def validate_phone(cls, value: Optional[str]):
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class TechnicianSignupRequestResponse(BaseModel):
    id: UUID
    name: str
    email: str
    phone: Optional[str] = None
    status: str
    requested_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TechnicianSignupDecisionRequest(BaseModel):
    reason: Optional[str] = Field(default=None, max_length=500)

