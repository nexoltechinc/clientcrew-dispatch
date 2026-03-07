from datetime import date, datetime, time
from decimal import Decimal
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, validator


class JobServiceResponse(BaseModel):
    id: str
    service_name: str
    source: str
    notes: Optional[str] = None
    quantity: Decimal
    unit_price: Decimal
    sort_order: int


class AdminJobListItemResponse(BaseModel):
    id: UUID
    job_code: str
    status: str
    dealership_id: Optional[UUID] = None
    dealership_name: Optional[str] = None
    assigned_technician_id: Optional[UUID] = None
    assigned_technician_name: Optional[str] = None
    pre_assigned_technician_id: Optional[UUID] = None
    pre_assigned_technician_name: Optional[str] = None
    pre_assignment_reason: Optional[str] = None
    service_type: Optional[str] = None
    service_names: List[str] = []
    service_entries: List[JobServiceResponse] = []
    vehicle: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    requested_service_date: Optional[date] = None
    requested_service_time: Optional[time] = None
    source_system: Optional[str] = None
    source_metadata: Optional[Dict[str, Any]] = None


class AdminJobAssignmentUpdateRequest(BaseModel):
    assigned_technician_id: Optional[UUID] = None


class AdminJobCreateRequest(BaseModel):
    job_code: Optional[str] = None
    dealership_name: str
    service_name: Optional[str] = None
    service_names: List[str] = []
    vehicle_summary: str
    pre_assigned_technician_id: Optional[UUID] = None
    requested_service_date: Optional[date] = None
    requested_service_time: Optional[time] = None

    @validator("dealership_name", "vehicle_summary")
    def validate_required_text(cls, value: str):
        normalized = value.strip()
        if not normalized:
            raise ValueError("This field is required")
        return normalized

    @validator("service_name")
    def validate_optional_service_name(cls, value: Optional[str]):
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @validator("service_names", pre=True)
    def validate_service_names(cls, value):
        if value is None:
            return []
        if not isinstance(value, list):
            raise ValueError("service_names must be a list")

        normalized: list[str] = []
        seen: set[str] = set()
        for item in value:
            if not isinstance(item, str):
                raise ValueError("service_names must contain strings")
            trimmed = item.strip()
            if not trimmed:
                continue
            key = trimmed.lower()
            if key in seen:
                continue
            seen.add(key)
            normalized.append(trimmed)
        return normalized

    @validator("job_code")
    def validate_optional_job_code(cls, value: Optional[str]):
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class AdminJobUpdateRequest(BaseModel):
    dealership_name: Optional[str] = None
    service_name: Optional[str] = None
    service_names: Optional[List[str]] = None
    vehicle_summary: Optional[str] = None
    requested_service_date: Optional[date] = None
    requested_service_time: Optional[time] = None

    @validator("dealership_name", "service_name", "vehicle_summary")
    def validate_optional_text(cls, value: Optional[str]):
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            raise ValueError("This field must not be blank")
        return normalized

    @validator("service_names", pre=True)
    def validate_optional_service_names(cls, value):
        if value is None:
            return None
        if not isinstance(value, list):
            raise ValueError("service_names must be a list")

        normalized: list[str] = []
        seen: set[str] = set()
        for item in value:
            if not isinstance(item, str):
                raise ValueError("service_names must contain strings")
            trimmed = item.strip()
            if not trimmed:
                continue
            key = trimmed.lower()
            if key in seen:
                continue
            seen.add(key)
            normalized.append(trimmed)
        if not normalized:
            raise ValueError("service_names must contain at least one service")
        return normalized
