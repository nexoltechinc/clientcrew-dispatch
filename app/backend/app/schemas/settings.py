from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator


class InvoiceBrandingSettingsPayload(BaseModel):
    logo_url: Optional[str] = None
    name: str = Field(..., min_length=1, max_length=255)
    street_address: str = Field(..., min_length=1)
    city: str = Field(..., min_length=1, max_length=128)
    state: str = Field(..., min_length=1, max_length=128)
    zip_code: str = Field(..., min_length=1, max_length=32)
    phone: str = Field(..., min_length=1, max_length=64)
    email: str = Field(..., min_length=1, max_length=255)
    website: str = Field(..., min_length=1, max_length=255)

    @field_validator("logo_url")
    @classmethod
    def _normalize_optional(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @field_validator("name", "street_address", "city", "state", "zip_code", "phone", "email", "website")
    @classmethod
    def _normalize_required(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("value cannot be blank")
        return normalized


class InvoiceBrandingSettingsResponse(InvoiceBrandingSettingsPayload):
    class Config:
        from_attributes = True


class AdminPasswordChangePayload(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=255)
    new_password: str = Field(..., min_length=6, max_length=255)

    @field_validator("current_password", "new_password")
    @classmethod
    def _normalize_password_fields(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("value cannot be blank")
        return normalized


class AdminPasswordChangeResponse(BaseModel):
    status: str
    admin_email: str
    password_changed_at: datetime


class AdminCredentialSettingsResponse(BaseModel):
    admin_email: str
    recovery_email: str
    password_changed_at: datetime
    updated_at: datetime


class AdminCredentialSettingsUpdatePayload(BaseModel):
    admin_email: str = Field(..., min_length=3, max_length=255)
    recovery_email: str = Field(..., min_length=3, max_length=255)
    current_password: str = Field(..., min_length=1, max_length=255)
    new_password: Optional[str] = Field(default=None, min_length=6, max_length=255)

    @field_validator("admin_email", "recovery_email")
    @classmethod
    def _normalize_email_fields(cls, value: str) -> str:
        normalized = value.strip().lower()
        if not normalized:
            raise ValueError("value cannot be blank")
        return normalized

    @field_validator("current_password")
    @classmethod
    def _normalize_current_password(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("value cannot be blank")
        return normalized

    @field_validator("new_password")
    @classmethod
    def _normalize_optional_password(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class PriorityRuleCreatePayload(BaseModel):
    description: str = Field(..., min_length=1, max_length=255)
    dealership_id: str = Field(..., min_length=1, max_length=64)
    service_id: Optional[str] = Field(default=None, max_length=64)
    target_urgency: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
    ranking_score: int = Field(default=10)
    is_active: bool = Field(default=True)

    @field_validator("description", "dealership_id")
    @classmethod
    def _normalize_required_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("value cannot be blank")
        return normalized

    @field_validator("service_id")
    @classmethod
    def _normalize_optional_text(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class PriorityRuleUpdatePayload(BaseModel):
    description: Optional[str] = Field(default=None, min_length=1, max_length=255)
    dealership_id: Optional[str] = Field(default=None, min_length=1, max_length=64)
    service_id: Optional[str] = Field(default=None, max_length=64)
    target_urgency: Optional[Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]] = None
    ranking_score: Optional[int] = None
    is_active: Optional[bool] = None

    @field_validator("description", "dealership_id")
    @classmethod
    def _normalize_optional_required_text(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            raise ValueError("value cannot be blank")
        return normalized

    @field_validator("service_id")
    @classmethod
    def _normalize_optional_service_id(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class PriorityRuleResponse(BaseModel):
    id: str
    description: str
    dealership_id: str
    service_id: Optional[str] = None
    target_urgency: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
    ranking_score: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
