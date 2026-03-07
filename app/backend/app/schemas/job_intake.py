from datetime import date, time
from typing import List, Literal, Optional
from uuid import UUID

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator


class MakeDealershipPayload(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    dealership_name: str = Field(..., min_length=1, max_length=255)
    # Make.com payloads may contain the expected accented key, but keep a fallback
    # for mojibake exports to avoid dropping the phone number.
    telephone: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("Téléphone", "TÃ©lÃ©phone"),
    )
    service: Optional[str] = Field(default=None, max_length=255)

    @field_validator("dealership_name", mode="before")
    @classmethod
    def normalize_name(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip()
        return value

    @field_validator("telephone", "service", mode="before")
    @classmethod
    def normalize_optional_text(cls, value: object) -> object:
        if isinstance(value, str):
            stripped = value.strip()
            return stripped or None
        return value


class MakeJobIntakeItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    job_id: str = Field(..., min_length=1, max_length=50)
    dealership: MakeDealershipPayload
    vehicle: str = Field(..., min_length=1, max_length=255)
    vehicle_number: Optional[str] = Field(default=None, max_length=64)
    date: date
    time: time
    urgent: bool = False
    confidence: Optional[int] = Field(default=None, ge=0, le=100)
    flags: List[str] = Field(default_factory=list)
    raw: str = ""

    @field_validator("job_id", "vehicle", "vehicle_number", "raw", mode="before")
    @classmethod
    def normalize_text_fields(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip()
        return value

    @field_validator("flags", mode="before")
    @classmethod
    def normalize_flags(cls, value: object) -> object:
        if value is None:
            return []
        return value


class MakeJobIntakeResultItem(BaseModel):
    id: UUID
    job_code: str
    status: str
    action: Literal["created", "updated"]
    dealership_id: Optional[UUID] = None
    requested_service_date: Optional[date] = None
    requested_service_time: Optional[time] = None


class MakeJobIntakeResponse(BaseModel):
    total: int
    created: int
    updated: int
    items: List[MakeJobIntakeResultItem]
