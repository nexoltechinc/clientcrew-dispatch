from enum import Enum
from typing import Optional


class DispatchJobStatus(str, Enum):
    UNKNOWN = "UNKNOWN"
    ADMIN_PREVIEW = "ADMIN_PREVIEW"
    READY_FOR_TECH = "READY_FOR_TECH"
    PENDING_ADMIN_CONFIRMATION = "PENDING_ADMIN_CONFIRMATION"
    PENDING_REVIEW = "PENDING_REVIEW"
    PENDING = "PENDING"
    SCHEDULED = "SCHEDULED"
    IN_PROGRESS = "IN_PROGRESS"
    DELAYED = "DELAYED"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


_NORMALIZATION_MAP = {
    "admin_review": DispatchJobStatus.ADMIN_PREVIEW,
    "admin_preview": DispatchJobStatus.ADMIN_PREVIEW,
    "ready_for_tech": DispatchJobStatus.READY_FOR_TECH,
    "ready_for_tech_acceptance": DispatchJobStatus.PENDING,
    "pending_admin_confirmation": DispatchJobStatus.PENDING_ADMIN_CONFIRMATION,
    "pending_review": DispatchJobStatus.PENDING_REVIEW,
    "pending": DispatchJobStatus.PENDING,
    "scheduled": DispatchJobStatus.SCHEDULED,
    "in_progress": DispatchJobStatus.IN_PROGRESS,
    "delayed": DispatchJobStatus.DELAYED,
    "completed": DispatchJobStatus.COMPLETED,
    "cancelled": DispatchJobStatus.CANCELLED,
}


def normalize_dispatch_job_status(value: Optional[str]) -> DispatchJobStatus:
    normalized = (value or "").strip().lower()
    return _NORMALIZATION_MAP.get(normalized, DispatchJobStatus.UNKNOWN)


def normalize_status(value: Optional[str]) -> DispatchJobStatus:
    return normalize_dispatch_job_status(value)


def db_status_from_dispatch_status(value: DispatchJobStatus) -> str:
    if value == DispatchJobStatus.ADMIN_PREVIEW:
        return "admin_review"
    return value.value.lower()
