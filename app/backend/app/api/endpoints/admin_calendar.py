from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ...api import deps
from ...core.enums import UserRole
from ...core.security import AuthenticatedUser
from ...models.calendar_event import CalendarEvent
from ...models.technician import Technician
from ...schemas.calendar import (
    CalendarEventAddNoteRequest,
    CalendarEventCreateRequest,
    CalendarEventResponse,
    CalendarEventScheduleUpdateRequest,
    CalendarEventUpdateRequest,
)

router = APIRouter(prefix="/admin/calendar", tags=["admin-calendar"])


def _ensure_valid_time_window(start_at: datetime, end_at: datetime) -> None:
    if end_at <= start_at:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="end_at must be after start_at",
        )


def _get_technician_or_404(db: Session, technician_id: UUID) -> Technician:
    technician = db.query(Technician).filter(Technician.id == technician_id).first()
    if technician is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Technician not found")
    return technician


def _normalize_activity_log(raw: Any) -> List[Dict[str, str]]:
    if not isinstance(raw, list):
        return []
    normalized: List[Dict[str, str]] = []
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        timestamp = str(entry.get("timestamp", "")).strip()
        actor_role = str(entry.get("actor_role", "")).strip()
        message = str(entry.get("message", "")).strip()
        if not timestamp or not actor_role or not message:
            continue
        normalized.append(
            {
                "timestamp": timestamp,
                "actor_role": actor_role,
                "message": message,
            }
        )
    return normalized


def _append_activity(
    event: CalendarEvent,
    *,
    actor_role: str,
    message: str,
) -> None:
    log = _normalize_activity_log(event.activity_log)
    log.append(
        {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "actor_role": actor_role,
            "message": message.strip(),
        }
    )
    event.activity_log = log


def _serialize_event_row(db: Session, row: CalendarEvent) -> CalendarEventResponse:
    technician_name = None
    if row.assigned_technician_id is not None:
        technician = db.query(Technician).filter(Technician.id == row.assigned_technician_id).first()
        technician_name = technician.name if technician is not None else None

    return CalendarEventResponse(
        id=row.id,
        title=row.title,
        event_type=row.event_type,
        customer_name=row.customer_name,
        location=row.location,
        assigned_technician_id=row.assigned_technician_id,
        assigned_technician_name=technician_name,
        start_at=row.start_at,
        end_at=row.end_at,
        description=row.description,
        priority=row.priority,
        attachments=list(row.attachments or []),
        reminder_email=bool(row.reminder_email),
        reminder_sms=bool(row.reminder_sms),
        reminder_dashboard=bool(row.reminder_dashboard),
        internal_notes=row.internal_notes,
        activity_log=_normalize_activity_log(row.activity_log),
        created_by_role=row.created_by_role,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _get_event_or_404(db: Session, event_id: UUID) -> CalendarEvent:
    row = db.query(CalendarEvent).filter(CalendarEvent.id == event_id).first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Calendar event not found")
    return row


@router.get("/events", response_model=List[CalendarEventResponse])
def list_calendar_events(
    start_at: Optional[datetime] = Query(None),
    end_at: Optional[datetime] = Query(None),
    technician_id: Optional[UUID] = Query(None),
    event_type: Optional[str] = Query(None),
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN, UserRole.TECHNICIAN)),
):
    query = db.query(CalendarEvent)

    if start_at is not None:
        query = query.filter(CalendarEvent.end_at >= start_at)
    if end_at is not None:
        query = query.filter(CalendarEvent.start_at <= end_at)
    if technician_id is not None:
        query = query.filter(CalendarEvent.assigned_technician_id == technician_id)
    if event_type is not None:
        query = query.filter(CalendarEvent.event_type == event_type)

    if current_user.role == UserRole.TECHNICIAN:
        query = query.filter(CalendarEvent.assigned_technician_id == current_user.user_id)

    rows = query.order_by(CalendarEvent.start_at.asc(), CalendarEvent.created_at.asc()).all()
    return [_serialize_event_row(db, row) for row in rows]


@router.post("/events", response_model=CalendarEventResponse, status_code=status.HTTP_201_CREATED)
def create_calendar_event(
    payload: CalendarEventCreateRequest,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    _ensure_valid_time_window(payload.start_at, payload.end_at)

    if payload.assigned_technician_id is not None:
        _get_technician_or_404(db, payload.assigned_technician_id)

    row = CalendarEvent(
        title=payload.title,
        event_type=payload.event_type,
        customer_name=payload.customer_name,
        location=payload.location,
        assigned_technician_id=payload.assigned_technician_id,
        start_at=payload.start_at,
        end_at=payload.end_at,
        description=payload.description,
        priority=payload.priority,
        attachments=payload.attachments,
        reminder_email=payload.reminder_email,
        reminder_sms=payload.reminder_sms,
        reminder_dashboard=payload.reminder_dashboard,
        internal_notes=payload.internal_notes,
        created_by_role=current_user.role.value,
        activity_log=[],
    )
    _append_activity(
        row,
        actor_role=current_user.role.value,
        message="Event created",
    )

    db.add(row)
    db.commit()
    db.refresh(row)
    return _serialize_event_row(db, row)


@router.patch("/events/{event_id}", response_model=CalendarEventResponse)
def update_calendar_event(
    event_id: UUID,
    payload: CalendarEventUpdateRequest,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    row = _get_event_or_404(db, event_id)
    provided_fields = set(payload.__fields_set__)

    if "title" in provided_fields:
        row.title = payload.title
    if "event_type" in provided_fields:
        row.event_type = payload.event_type
    if "customer_name" in provided_fields:
        row.customer_name = payload.customer_name
    if "location" in provided_fields:
        row.location = payload.location
    if "description" in provided_fields:
        row.description = payload.description
    if "priority" in provided_fields:
        row.priority = payload.priority
    if "attachments" in provided_fields:
        row.attachments = payload.attachments
    if "reminder_email" in provided_fields:
        row.reminder_email = payload.reminder_email
    if "reminder_sms" in provided_fields:
        row.reminder_sms = payload.reminder_sms
    if "reminder_dashboard" in provided_fields:
        row.reminder_dashboard = payload.reminder_dashboard
    if "internal_notes" in provided_fields:
        row.internal_notes = payload.internal_notes

    if "assigned_technician_id" in provided_fields and payload.assigned_technician_id is not None:
        _get_technician_or_404(db, payload.assigned_technician_id)
    if "assigned_technician_id" in provided_fields:
        row.assigned_technician_id = payload.assigned_technician_id

    next_start = payload.start_at if "start_at" in provided_fields else row.start_at
    next_end = payload.end_at if "end_at" in provided_fields else row.end_at
    _ensure_valid_time_window(next_start, next_end)
    row.start_at = next_start
    row.end_at = next_end

    _append_activity(
        row,
        actor_role=current_user.role.value,
        message="Event details updated",
    )

    db.commit()
    db.refresh(row)
    return _serialize_event_row(db, row)


@router.patch("/events/{event_id}/schedule", response_model=CalendarEventResponse)
def update_calendar_event_schedule(
    event_id: UUID,
    payload: CalendarEventScheduleUpdateRequest,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    row = _get_event_or_404(db, event_id)
    _ensure_valid_time_window(payload.start_at, payload.end_at)

    if payload.assigned_technician_id is not None:
        _get_technician_or_404(db, payload.assigned_technician_id)
        row.assigned_technician_id = payload.assigned_technician_id

    row.start_at = payload.start_at
    row.end_at = payload.end_at
    _append_activity(
        row,
        actor_role=current_user.role.value,
        message="Event rescheduled via drag-and-drop",
    )

    db.commit()
    db.refresh(row)
    return _serialize_event_row(db, row)


@router.post("/events/{event_id}/notes", response_model=CalendarEventResponse)
def add_calendar_event_note(
    event_id: UUID,
    payload: CalendarEventAddNoteRequest,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN, UserRole.TECHNICIAN)),
):
    row = _get_event_or_404(db, event_id)

    if current_user.role == UserRole.TECHNICIAN and row.assigned_technician_id != current_user.user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only comment on your own events")

    _append_activity(
        row,
        actor_role=current_user.role.value,
        message=payload.note,
    )

    db.commit()
    db.refresh(row)
    return _serialize_event_row(db, row)


@router.delete("/events/{event_id}", response_model=Dict[str, str])
def delete_calendar_event(
    event_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    row = _get_event_or_404(db, event_id)
    db.delete(row)
    db.commit()
    return {"status": "ok"}
