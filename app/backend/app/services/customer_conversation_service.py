from __future__ import annotations

import re
import unicodedata
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, Optional
from uuid import UUID, uuid4

from fastapi import HTTPException, status
from sqlalchemy.orm import Session, selectinload

from ..core.config import (
    CUSTOMER_CONVERSATION_EMAIL_FALLBACK_ENABLED,
    CUSTOMER_CONVERSATION_UNREAD_EMAIL_THRESHOLD_MINUTES,
)
from ..core.enums import AuditEntityType, UserRole
from ..core.job_status import DispatchJobStatus, db_status_from_dispatch_status
from ..core.security import AuthenticatedUser
from ..models.customer_conversation import (
    CustomerConversation,
    CustomerConversationMessage,
    CustomerConversationNote,
    CustomerIntakeRecord,
)
from ..models.dealership import Dealership
from ..models.job import Job
from ..models.notification import Notification
from ..models.service_catalog import ServiceCatalog
from ..models.technician import Technician
from ..schemas.customer_conversations import (
    CustomerConversationAssignmentRequest,
    CustomerConversationCollectedFieldsResponse,
    CustomerConversationConvertToJobRequest,
    CustomerConversationCustomerProfileResponse,
    CustomerConversationDetailResponse,
    CustomerConversationIntakeResponse,
    CustomerConversationIntakeUpsertRequest,
    CustomerConversationJobLinkResponse,
    CustomerConversationLinkIntakeRequest,
    CustomerConversationLinkJobRequest,
    CustomerConversationListItemResponse,
    CustomerConversationMessageResponse,
    CustomerConversationNoteCreateRequest,
    CustomerConversationNoteResponse,
    CustomerConversationReplyRequest,
    CustomerConversationServiceMatchCandidateResponse,
    CustomerConversationStatusUpdateRequest,
    CustomerConversationSummaryResponse,
)
from ..schemas.customer_portal import CustomerServiceRequestCreateRequest
from .admin_credential_settings_service import AdminCredentialSettingsService
from .audit_service import AuditService
from .email_service import EmailService
from .job_services_service import JobServicesService
from .service_catalog_service import ServiceCatalogService


PHONE_DIGIT_RE = re.compile(r"\D+")

STATUS_LABELS: dict[str, str] = {
    "bot_active": "Bot Active",
    "waiting_for_agent": "Waiting for Agent",
    "agent_joined": "Agent Joined",
    "intake_created": "Intake Created",
    "converted_to_job": "Converted to Job",
    "waiting_for_customer": "Waiting for Customer",
    "closed": "Closed",
    "escalated": "Escalated",
    "missed": "Missed",
}

DEFAULT_ALLOWED_ACTIONS = [
    "join",
    "reply",
    "assign",
    "mark_waiting_for_customer",
    "create_intake",
    "link_intake",
    "convert_to_job",
    "link_job",
    "add_internal_note",
    "mark_urgent",
    "close",
    "escalate",
]


def _normalize_text(value: Optional[str]) -> str:
    if not value:
        return ""
    normalized = unicodedata.normalize("NFD", value.strip().lower())
    return "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")


def _normalize_phone(value: Optional[str]) -> str:
    if not value:
        return ""
    return PHONE_DIGIT_RE.sub("", value)


def _truncate(value: Optional[str], limit: int = 500) -> Optional[str]:
    if value is None:
        return None
    normalized = value.strip()
    if not normalized:
        return None
    if len(normalized) <= limit:
        return normalized
    return normalized[: max(0, limit - 1)].rstrip() + "..."


def _map_request_urgency(value: str) -> str:
    normalized = (value or "").strip().lower()
    if normalized == "low":
        return "low"
    if normalized in {"medium", "normal"}:
        return "normal"
    if normalized == "high":
        return "high"
    if normalized in {"critical", "urgent"}:
        return "urgent"
    return "normal"


def _make_reference(prefix: str, db: Session, column_name: str, model: type[Any]) -> str:
    lookup_column = getattr(model, column_name)
    for _ in range(25):
        candidate = f"{prefix}-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{uuid4().hex[:6].upper()}"
        if db.query(model.id).filter(lookup_column == candidate).first() is None:
            return candidate
    raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Could not generate unique reference number")


def _safe_dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _request_customer_message(payload: CustomerServiceRequestCreateRequest) -> str:
    requested = [item.strip() for item in payload.requested_services if isinstance(item, str) and item.strip()]
    service_text = (payload.requested_service_text or "").strip()
    parts: list[str] = []
    if requested:
        parts.append(f"Requested services: {', '.join(requested)}")
    if service_text:
        parts.append(service_text)
    vehicle_description = (payload.vehicle_description or "").strip()
    if vehicle_description:
        parts.append(f"Vehicle: {vehicle_description}")
    branch = (payload.service_location_or_branch or "").strip()
    if branch:
        parts.append(f"Location: {branch}")
    notes = (payload.special_notes or "").strip()
    if notes:
        parts.append(f"Notes: {notes}")
    return " | ".join(parts) if parts else "Customer submitted a service request."


class CustomerConversationService:
    def __init__(self, db: Session, current_user: Optional[AuthenticatedUser] = None):
        self.db = db
        self.current_user = current_user
        self.email_service = EmailService()

    def _actor_id(self) -> UUID:
        if self.current_user is not None:
            return self.current_user.user_id
        return uuid4()

    def _best_admin_label(self) -> str:
        settings = AdminCredentialSettingsService(self.db).get_settings()
        return settings.get("admin_email") or "DispatchIQ"

    def _status_label(self, value: str) -> str:
        return STATUS_LABELS.get((value or "").strip().lower(), "Waiting for Agent")

    def _load_conversations(self) -> list[CustomerConversation]:
        return (
            self.db.query(CustomerConversation)
            .options(
                selectinload(CustomerConversation.dealership),
                selectinload(CustomerConversation.matched_service),
                selectinload(CustomerConversation.linked_job),
                selectinload(CustomerConversation.intake),
            )
            .order_by(CustomerConversation.last_activity_at.desc(), CustomerConversation.created_at.desc())
            .all()
        )

    def _load_detail_conversation(self, conversation_id: UUID) -> CustomerConversation:
        row = (
            self.db.query(CustomerConversation)
            .options(
                selectinload(CustomerConversation.dealership),
                selectinload(CustomerConversation.matched_service),
                selectinload(CustomerConversation.linked_job),
                selectinload(CustomerConversation.intake),
                selectinload(CustomerConversation.messages),
                selectinload(CustomerConversation.notes),
            )
            .filter(CustomerConversation.id == conversation_id)
            .first()
        )
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
        return row

    def _require_conversation(self, conversation_id: UUID) -> CustomerConversation:
        row = self.db.query(CustomerConversation).filter(CustomerConversation.id == conversation_id).first()
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
        return row

    def _require_intake(self, intake_id: UUID) -> CustomerIntakeRecord:
        row = self.db.query(CustomerIntakeRecord).filter(CustomerIntakeRecord.id == intake_id).first()
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Intake not found")
        return row

    def _find_intake_by_number(self, intake_number: str) -> CustomerIntakeRecord:
        row = (
            self.db.query(CustomerIntakeRecord)
            .filter(CustomerIntakeRecord.intake_number == intake_number.strip())
            .first()
        )
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Intake not found")
        return row

    def _require_job(self, job_id: UUID) -> Job:
        row = self.db.query(Job).filter(Job.id == job_id).first()
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
        return row

    def _find_job_by_code(self, job_code: str) -> Job:
        row = self.db.query(Job).filter(Job.job_code == job_code.strip()).first()
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
        return row

    def _serialize_message(self, row: CustomerConversationMessage) -> CustomerConversationMessageResponse:
        return CustomerConversationMessageResponse(
            id=row.id,
            conversation_id=row.conversation_id,
            sender_type=row.sender_type,  # type: ignore[arg-type]
            sender_label=row.sender_label,
            message_kind=row.message_kind,
            body=row.body,
            attachment_url=row.attachment_url,
            attachment_name=row.attachment_name,
            attachment_mime_type=row.attachment_mime_type,
            metadata=_safe_dict(row.metadata_json) or None,
            delivered_at=row.delivered_at,
            read_at=row.read_at,
            created_at=row.created_at,
        )

    def _serialize_note(self, row: CustomerConversationNote) -> CustomerConversationNoteResponse:
        return CustomerConversationNoteResponse(
            id=row.id,
            conversation_id=row.conversation_id,
            author_admin_id=row.author_admin_id,
            author_admin_label=row.author_admin_label,
            note_body=row.note_body,
            created_at=row.created_at,
        )

    def _serialize_intake(self, row: CustomerIntakeRecord) -> CustomerConversationIntakeResponse:
        return CustomerConversationIntakeResponse(
            id=row.id,
            intake_number=row.intake_number,
            source_system=row.source_system,  # type: ignore[arg-type]
            status=row.status,  # type: ignore[arg-type]
            conversation_id=row.conversation_id,
            dealership_id=row.dealership_id,
            customer_name=row.customer_name,
            contact_person=row.contact_person,
            phone=row.phone,
            email=row.email,
            requested_service_text=row.requested_service_text,
            matched_service_id=row.matched_service_id,
            matched_service_name=row.matched_service_name,
            vehicle_description=row.vehicle_description,
            vehicle_unit_or_stock_number=row.vehicle_unit_or_stock_number,
            preferred_date=row.preferred_date,
            preferred_time=row.preferred_time,
            location_branch=row.location_branch,
            urgency=_map_request_urgency(row.urgency),
            notes=row.notes,
            linked_job_id=row.linked_job_id,
            created_by_admin_id=row.created_by_admin_id,
            created_by_admin_label=row.created_by_admin_label,
            updated_by_admin_id=row.updated_by_admin_id,
            updated_by_admin_label=row.updated_by_admin_label,
            created_at=row.created_at,
            updated_at=row.updated_at,
        )

    def _serialize_job_link(self, row: Job) -> CustomerConversationJobLinkResponse:
        dealership = None
        if row.dealership_id is not None:
            dealership = self.db.query(Dealership).filter(Dealership.id == row.dealership_id).first()
        return CustomerConversationJobLinkResponse(
            job_id=row.id,
            job_code=row.job_code,
            status=row.status,
            dealership_id=row.dealership_id,
            dealership_name=dealership.name if dealership else row.customer_name,
            service_type=row.service_type,
            vehicle=row.vehicle,
            requested_service_date=row.requested_service_date,
            requested_service_time=row.requested_service_time,
        )

    def _service_candidates(
        self,
        requested_text: str,
        requested_services: list[str],
        selected_service_id: Optional[UUID] = None,
    ) -> list[ServiceCatalog]:
        services = ServiceCatalogService(self.db).list_active_services()
        if selected_service_id is not None:
            for row in services:
                if row.id == selected_service_id:
                    return [row]
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found")

        search_text = _normalize_text(" ".join([requested_text, *requested_services]))
        tokens = [token for token in search_text.split(" ") if len(token) >= 3]
        if not tokens:
            return []

        alias_map: dict[str, list[str]] = {
            "ppf": ["ppf", "paint protection film"],
            "tint": ["window tint", "tint"],
            "ceramic": ["ceramic coating"],
            "correction": ["paint correction"],
            "wash": ["car wash", "wash"],
            "interior": ["interior cleaning"],
            "detail": ["detailing"],
            "engine": ["engine bay"],
            "headlight": ["headlight"],
            "roadside": ["roadside"],
            "starter": ["remote starter", "remote start"],
            "remote": ["remote starter", "remote start"],
            "quick": ["quick service"],
        }

        scored: list[tuple[int, ServiceCatalog]] = []
        for row in services:
            haystack = _normalize_text(" ".join([row.name, row.category, row.description or "", row.code, row.sku or ""]))
            score = 0
            for token in tokens:
                if token in haystack:
                    score += 2
                if token in _normalize_text(row.name):
                    score += 3
            for token, aliases in alias_map.items():
                if token in search_text and any(alias in haystack for alias in aliases):
                    score += 4
            if search_text and search_text in haystack:
                score += 5
            if score > 0:
                scored.append((score, row))

        scored.sort(key=lambda item: (-item[0], item[1].name.lower()))
        return [row for _, row in scored[:5]]

    def _find_dealership(self, name: Optional[str], phone: Optional[str], email: Optional[str]) -> Optional[Dealership]:
        normalized_name = _normalize_text(name)
        normalized_phone = _normalize_phone(phone)
        normalized_email = _normalize_text(email)
        for row in self.db.query(Dealership).all():
            if normalized_name and normalized_name == _normalize_text(row.name):
                return row
            if normalized_phone and normalized_phone == _normalize_phone(row.phone):
                return row
            if normalized_email and normalized_email == _normalize_text(row.email):
                return row
        return None

    def _conversation_matches_search(self, row: CustomerConversation, search_value: str) -> bool:
        haystack_parts = [
            row.reference_number,
            row.customer_name,
            row.contact_person,
            row.phone,
            row.email,
            row.requested_service_text,
            row.matched_service_name,
            row.dealership_name,
            row.source_channel,
            row.status,
            row.urgency,
            row.assigned_admin_label,
            row.linked_job.job_code if row.linked_job else None,
            row.intake.intake_number if row.intake else None,
            row.linked_job.service_type if row.linked_job else None,
        ]
        haystack = _normalize_text(" ".join(part for part in haystack_parts if part))
        return search_value in haystack

    def _is_inactive_warning(self, row: CustomerConversation) -> bool:
        return bool(row.dealership is not None and (row.dealership.status or "").strip().lower() == "inactive")

    def _service_match_ambiguous(self, row: CustomerConversation) -> bool:
        candidates = row.matched_service_candidates if isinstance(row.matched_service_candidates, list) else []
        return len(candidates) > 1 and row.matched_service_id is None

    def _allowed_actions(self, row: CustomerConversation) -> list[str]:
        if row.status == "closed":
            return ["add_internal_note", "escalate"]
        if row.status == "converted_to_job":
            return ["join", "reply", "assign", "link_job", "add_internal_note", "mark_urgent", "close", "escalate"]
        return list(DEFAULT_ALLOWED_ACTIONS)

    def _customer_profile(self, row: CustomerConversation) -> CustomerConversationCustomerProfileResponse:
        warning = None
        if row.dealership is not None and (row.dealership.status or "").strip().lower() == "inactive":
            warning = "This account is inactive. Admin review is required."
        return CustomerConversationCustomerProfileResponse(
            dealership_id=row.dealership.id if row.dealership else row.dealership_id,
            dealership_name=row.dealership.name if row.dealership else row.dealership_name,
            dealership_status=row.dealership.status if row.dealership else None,
            customer_name=row.customer_name,
            contact_person=row.contact_person,
            phone=row.phone,
            email=row.email,
            account_warning=warning,
            matched_job_code=row.linked_job.job_code if row.linked_job else None,
            matched_intake_number=row.intake.intake_number if row.intake else None,
        )

    def _collected_fields(self, row: CustomerConversation) -> CustomerConversationCollectedFieldsResponse:
        candidates = row.matched_service_candidates if isinstance(row.matched_service_candidates, list) else []
        return CustomerConversationCollectedFieldsResponse(
            requested_service_text=row.requested_service_text,
            matched_service_id=row.matched_service_id,
            matched_service_name=row.matched_service_name,
            matched_service_candidates=[
                CustomerConversationServiceMatchCandidateResponse.model_validate(candidate)
                for candidate in candidates
                if isinstance(candidate, dict)
            ],
            preferred_date=row.preferred_date,
            preferred_time=row.preferred_time,
            service_location_or_branch=row.service_location_or_branch,
            vehicle_description=row.vehicle_description,
            vehicle_unit_or_stock_number=row.vehicle_unit_or_stock_number,
            urgency=_map_request_urgency(row.urgency),
            special_notes=row.special_notes,
        )

    def _detail_response(self, row: CustomerConversation) -> CustomerConversationDetailResponse:
        requested_service = row.requested_service_text or row.matched_service_name or (row.linked_job.service_type if row.linked_job else None)
        return CustomerConversationDetailResponse(
            id=row.id,
            reference_number=row.reference_number,
            source_channel=row.source_channel,  # type: ignore[arg-type]
            status=row.status,  # type: ignore[arg-type]
            urgency=_map_request_urgency(row.urgency),  # type: ignore[arg-type]
            customer_name=row.customer_name,
            contact_person=row.contact_person,
            phone=row.phone,
            email=row.email,
            requested_service=requested_service,
            matched_service_name=row.matched_service_name,
            last_message_preview=row.last_message_preview,
            assigned_admin_label=row.assigned_admin_label,
            created_at=row.created_at,
            last_activity_at=row.last_activity_at,
            unread_count=int(row.unread_count or 0),
            dealership_name=row.dealership.name if row.dealership else row.dealership_name,
            dealership_status=row.dealership.status if row.dealership else None,
            linked_job_code=row.linked_job.job_code if row.linked_job else None,
            linked_intake_number=row.intake.intake_number if row.intake else None,
            is_inactive_account_warning=self._is_inactive_warning(row),
            is_service_match_ambiguous=self._service_match_ambiguous(row),
            customer_profile=self._customer_profile(row),
            collected_fields=self._collected_fields(row),
            messages=[self._serialize_message(message) for message in row.messages],
            internal_notes=[self._serialize_note(note) for note in row.notes],
            linked_intake=self._serialize_intake(row.intake) if row.intake else None,
            linked_job=self._serialize_job_link(row.linked_job) if row.linked_job else None,
            allowed_actions=self._allowed_actions(row),
            source_metadata=_safe_dict(row.source_metadata) or None,
        )

    def _list_item_response(self, row: CustomerConversation) -> CustomerConversationListItemResponse:
        requested_service = row.requested_service_text or row.matched_service_name or (row.linked_job.service_type if row.linked_job else None)
        return CustomerConversationListItemResponse(
            id=row.id,
            reference_number=row.reference_number,
            source_channel=row.source_channel,  # type: ignore[arg-type]
            status=row.status,  # type: ignore[arg-type]
            urgency=_map_request_urgency(row.urgency),  # type: ignore[arg-type]
            customer_name=row.customer_name,
            contact_person=row.contact_person,
            phone=row.phone,
            email=row.email,
            requested_service=requested_service,
            matched_service_name=row.matched_service_name,
            last_message_preview=row.last_message_preview,
            assigned_admin_label=row.assigned_admin_label,
            created_at=row.created_at,
            last_activity_at=row.last_activity_at,
            unread_count=int(row.unread_count or 0),
            dealership_name=row.dealership.name if row.dealership else row.dealership_name,
            dealership_status=row.dealership.status if row.dealership else None,
            linked_job_code=row.linked_job.job_code if row.linked_job else None,
            linked_intake_number=row.intake.intake_number if row.intake else None,
            is_inactive_account_warning=self._is_inactive_warning(row),
            is_service_match_ambiguous=self._service_match_ambiguous(row),
        )

    def _notification_metadata(self, row: CustomerConversation) -> Dict[str, Any]:
        return {
            "conversation_id": str(row.id),
            "reference_number": row.reference_number,
            "source_channel": row.source_channel,
            "status": row.status,
            "urgency": row.urgency,
            "customer_name": row.customer_name,
            "contact_person": row.contact_person,
            "phone": row.phone,
            "email": row.email,
            "linked_job_code": row.linked_job.job_code if row.linked_job else None,
        }

    def _insert_notification(self, row: CustomerConversation, message: str) -> None:
        self.db.add(
            Notification(
                recipient_role="admin",
                message=message,
                metadata_json=self._notification_metadata(row),
            )
        )

    def _set_timestamp_for_status(self, row: CustomerConversation, status_value: str, when: datetime) -> None:
        normalized = (status_value or "").strip().lower()
        if normalized == "agent_joined":
            row.agent_joined_at = when
        elif normalized == "waiting_for_customer":
            row.waiting_for_customer_at = when
        elif normalized == "escalated":
            row.escalated_at = when
        elif normalized == "closed":
            row.closed_at = when
        elif normalized == "missed":
            row.missed_at = when

    def _record_message(
        self,
        row: CustomerConversation,
        *,
        sender_type: str,
        body: str,
        sender_label: Optional[str] = None,
        message_kind: str = "text",
        attachment_url: Optional[str] = None,
        attachment_name: Optional[str] = None,
        attachment_mime_type: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        count_as_unread: bool = False,
        delivered: bool = True,
        read: bool = False,
    ) -> CustomerConversationMessage:
        now = datetime.now(timezone.utc)
        message = CustomerConversationMessage(
            conversation_id=row.id,
            sender_type=sender_type,
            sender_label=sender_label,
            message_kind=message_kind,
            body=body.strip(),
            attachment_url=attachment_url,
            attachment_name=attachment_name,
            attachment_mime_type=attachment_mime_type,
            metadata_json=metadata,
            delivered_at=now if delivered else None,
            read_at=now if read else None,
        )
        self.db.add(message)
        row.last_message_preview = _truncate(body, 500)
        row.last_message_at = now
        row.last_activity_at = now
        if count_as_unread:
            row.unread_count = int(row.unread_count or 0) + 1
        sender = (sender_type or "").strip().lower()
        if sender == "admin":
            row.unread_count = 0
            row.unread_email_alert_sent_at = None
            if row.status not in {"closed", "converted_to_job"}:
                row.status = "agent_joined"
                self._set_timestamp_for_status(row, "agent_joined", now)
        elif sender in {"customer", "bot"} and row.status == "bot_active":
            row.status = "waiting_for_agent"
        return message

    def _clear_unread(self, row: CustomerConversation) -> None:
        row.unread_count = 0
        row.unread_email_alert_sent_at = None

    def _maybe_send_email_alert(self, row: CustomerConversation) -> None:
        if not CUSTOMER_CONVERSATION_EMAIL_FALLBACK_ENABLED:
            return
        if int(row.unread_count or 0) <= 0:
            return
        if row.unread_email_alert_sent_at is not None or row.last_activity_at is None:
            return

        threshold = timedelta(minutes=max(1, int(CUSTOMER_CONVERSATION_UNREAD_EMAIL_THRESHOLD_MINUTES)))
        if datetime.now(timezone.utc) - row.last_activity_at < threshold:
            return

        settings = AdminCredentialSettingsService(self.db).get_settings()
        recipient = settings.get("recovery_email") or settings.get("admin_email")
        if not recipient:
            return

        subject = f"DispatchIQ unread customer conversation: {row.reference_number}"
        body = (
            f"Customer conversation {row.reference_number} has been unread for more than "
            f"{CUSTOMER_CONVERSATION_UNREAD_EMAIL_THRESHOLD_MINUTES} minutes.\n\n"
            f"Customer: {row.customer_name or 'Unknown'}\n"
            f"Contact: {row.contact_person or 'Unknown'}\n"
            f"Service: {row.requested_service_text or row.matched_service_name or 'Unknown'}\n"
            f"Status: {self._status_label(row.status)}\n"
            f"Last activity: {row.last_activity_at.isoformat() if row.last_activity_at else 'Unknown'}\n"
        )
        try:
            self.email_service.send_plain_email(recipient_email=recipient, subject=subject, body_text=body)
            row.unread_email_alert_sent_at = datetime.now(timezone.utc)
        except Exception:
            pass

    def _process_email_fallbacks(self) -> None:
        for row in self._load_conversations():
            self._maybe_send_email_alert(row)
        self.db.commit()

    def _conversation_from_request(
        self,
        payload: CustomerServiceRequestCreateRequest,
        job_row: Job,
        dealership: Optional[Dealership],
    ) -> CustomerConversation:
        requested_services = [item.strip() for item in payload.requested_services if isinstance(item, str) and item.strip()]
        service_text = (payload.requested_service_text or "").strip()
        request_message = _request_customer_message(payload)
        service_candidates = self._service_candidates(service_text or request_message, requested_services)
        matched_service = service_candidates[0] if len(service_candidates) == 1 else None

        existing = None
        if payload.idempotency_key:
            for row in self.db.query(CustomerConversation).all():
                metadata = _safe_dict(row.source_metadata)
                if metadata.get("idempotency_key") == payload.idempotency_key:
                    existing = row
                    break
        if existing is None and payload.portal_session_id:
            for row in self.db.query(CustomerConversation).all():
                if row.source_session_id == payload.portal_session_id and row.source_channel == payload.source_channel:
                    existing = row
                    break

        conversation = existing or CustomerConversation(
            reference_number=_make_reference("CX", self.db, "reference_number", CustomerConversation),
            source_channel=payload.source_channel,
        )
        if existing is None:
            self.db.add(conversation)

        now = datetime.now(timezone.utc)
        matched_candidates_json = [
            {
                "id": str(row.id),
                "code": row.code,
                "name": row.name,
                "category": row.category,
                "default_price": str(row.default_price),
                "approval_required": bool(row.approval_required),
                "status": row.status,
            }
            for row in service_candidates
        ]

        source_metadata = {
            **_safe_dict(conversation.source_metadata),
            "source_channel": payload.source_channel,
            "portal_session_id": payload.portal_session_id,
            "idempotency_key": payload.idempotency_key,
            "request_type": "service_request" if requested_services or service_text else "support_request",
            "raw_request": payload.model_dump(mode="json"),
            "job_code": job_row.job_code,
            "job_id": str(job_row.id),
            "dealership_id": str(dealership.id) if dealership else None,
            "matched_service_candidates": matched_candidates_json,
            "matched_service_id": str(matched_service.id) if matched_service else None,
            "matched_service_name": matched_service.name if matched_service else None,
        }

        conversation.source_channel = payload.source_channel
        conversation.status = "waiting_for_agent"
        conversation.urgency = _map_request_urgency(payload.urgency)
        conversation.customer_name = payload.customer_name
        conversation.contact_person = payload.contact_person
        conversation.phone = payload.phone
        conversation.email = payload.email
        conversation.dealership_id = dealership.id if dealership else conversation.dealership_id
        conversation.dealership_name = dealership.name if dealership else payload.customer_name
        conversation.requested_service_text = service_text or conversation.requested_service_text
        conversation.matched_service_id = matched_service.id if matched_service else conversation.matched_service_id
        conversation.matched_service_name = matched_service.name if matched_service else conversation.matched_service_name
        conversation.matched_service_candidates = matched_candidates_json
        conversation.preferred_date = payload.preferred_date
        conversation.preferred_time = payload.preferred_time
        conversation.service_location_or_branch = payload.service_location_or_branch
        conversation.vehicle_description = payload.vehicle_description
        conversation.vehicle_unit_or_stock_number = payload.vehicle_unit_or_stock_number
        conversation.special_notes = payload.special_notes
        conversation.source_session_id = payload.portal_session_id
        conversation.source_metadata = source_metadata
        conversation.linked_job_id = job_row.id
        conversation.last_activity_at = now
        conversation.last_message_preview = _truncate(request_message, 500)
        conversation.last_message_at = now
        conversation.unread_count = int(conversation.unread_count or 0)

        duplicate_message = False
        if existing is not None and existing.linked_job_id == job_row.id:
            duplicate_message = any(
                message.sender_type == "customer" and message.body.strip() == request_message.strip()
                for message in conversation.messages
            )

        if not duplicate_message:
            self._record_message(
                conversation,
                sender_type="customer",
                sender_label=payload.contact_person or payload.customer_name,
                body=request_message,
                metadata={
                    "source_channel": payload.source_channel,
                    "idempotency_key": payload.idempotency_key,
                    "portal_session_id": payload.portal_session_id,
                },
                count_as_unread=True,
                delivered=True,
                read=False,
            )
            self._record_message(
                conversation,
                sender_type="system",
                sender_label="DispatchIQ",
                body="Dispatch/admin will review the request and follow up shortly.",
                metadata={"source_channel": payload.source_channel, "job_code": job_row.job_code},
                count_as_unread=False,
                delivered=True,
                read=True,
            )
            self._insert_notification(
                conversation,
                f"New customer conversation {conversation.reference_number} from {payload.customer_name}",
            )

        return conversation

    def register_service_request(
        self,
        *,
        payload: CustomerServiceRequestCreateRequest,
        job_row: Job,
        dealership: Optional[Dealership],
    ) -> CustomerConversation:
        conversation = self._conversation_from_request(payload, job_row, dealership)
        self.db.commit()
        self.db.refresh(conversation)
        return conversation

    def list_conversations(
        self,
        *,
        status_filter: Optional[str] = None,
        assigned_agent: Optional[str] = None,
        urgency: Optional[str] = None,
        service_type: Optional[str] = None,
        source_channel: Optional[str] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        unread_only: bool = False,
        search: Optional[str] = None,
    ) -> list[CustomerConversationListItemResponse]:
        self._process_email_fallbacks()
        rows = self._load_conversations()
        search_value = _normalize_text(search)
        filtered: list[CustomerConversationListItemResponse] = []
        normalized_status = (status_filter or "").strip().lower()
        normalized_agent = _normalize_text(assigned_agent)
        normalized_service_type = _normalize_text(service_type)
        normalized_source_channel = (source_channel or "").strip().lower()

        for row in rows:
            if normalized_status and row.status != normalized_status:
                continue
            if normalized_agent and normalized_agent not in _normalize_text(row.assigned_admin_label):
                continue
            if urgency and row.urgency != urgency:
                continue
            if normalized_source_channel and row.source_channel != normalized_source_channel:
                continue
            if normalized_service_type:
                combined = _normalize_text(
                    " ".join(
                        [
                            row.requested_service_text or "",
                            row.matched_service_name or "",
                            row.linked_job.service_type if row.linked_job else "",
                            row.intake.matched_service_name if row.intake else "",
                        ]
                    )
                )
                if normalized_service_type not in combined:
                    continue
            if unread_only and int(row.unread_count or 0) <= 0:
                continue
            if date_from and row.created_at.date() < date_from:
                continue
            if date_to and row.created_at.date() > date_to:
                continue
            if search_value and not self._conversation_matches_search(row, search_value):
                continue
            filtered.append(self._list_item_response(row))
        return filtered

    def get_summary(self) -> CustomerConversationSummaryResponse:
        self._process_email_fallbacks()
        rows = self._load_conversations()
        counts = {
            "total": len(rows),
            "unread": 0,
            "waiting_for_agent": 0,
            "agent_joined": 0,
            "intake_created": 0,
            "converted_to_job": 0,
            "waiting_for_customer": 0,
            "escalated": 0,
            "missed": 0,
            "urgent": 0,
        }
        for row in rows:
            if int(row.unread_count or 0) > 0:
                counts["unread"] += 1
            normalized_status = (row.status or "").strip().lower()
            if normalized_status in counts:
                counts[normalized_status] += 1
            if (row.urgency or "").strip().lower() == "urgent":
                counts["urgent"] += 1
        return CustomerConversationSummaryResponse(**counts)

    def get_conversation(self, conversation_id: UUID) -> CustomerConversationDetailResponse:
        return self._detail_response(self._load_detail_conversation(conversation_id))

    def list_messages(self, conversation_id: UUID) -> list[CustomerConversationMessageResponse]:
        row = self._load_detail_conversation(conversation_id)
        return [self._serialize_message(message) for message in row.messages]

    def join_conversation(self, conversation_id: UUID) -> CustomerConversationDetailResponse:
        row = self._require_conversation(conversation_id)
        if row.status == "closed":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Closed conversations cannot be joined")
        now = datetime.now(timezone.utc)
        row.status = "agent_joined"
        row.agent_joined_at = now
        if not row.assigned_admin_label:
            row.assigned_admin_label = self._best_admin_label()
        self._record_message(
            row,
            sender_type="system",
            sender_label="DispatchIQ",
            body="An admin has joined the conversation.",
            metadata={"event": "agent_joined"},
            delivered=True,
            read=True,
        )
        AuditService.log_event(
            self.db,
            actor_role=UserRole.ADMIN,
            actor_id=self._actor_id(),
            action="admin.customer_conversation.joined",
            entity_type=AuditEntityType.CUSTOMER_CONVERSATION.value,
            entity_id=row.id,
            metadata={"reference_number": row.reference_number},
        )
        self.db.commit()
        self.db.refresh(row)
        return self.get_conversation(conversation_id)

    def reply_to_conversation(self, conversation_id: UUID, payload: CustomerConversationReplyRequest) -> CustomerConversationDetailResponse:
        row = self._require_conversation(conversation_id)
        if row.status == "closed":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Closed conversations cannot be replied to")
        admin_label = self._best_admin_label()
        row.assigned_admin_label = row.assigned_admin_label or admin_label
        self._record_message(
            row,
            sender_type="admin",
            sender_label=admin_label,
            body=payload.message,
            attachment_url=payload.attachment_url,
            attachment_name=payload.attachment_name,
            attachment_mime_type=payload.attachment_mime_type,
            delivered=True,
            read=True,
        )
        AuditService.log_event(
            self.db,
            actor_role=UserRole.ADMIN,
            actor_id=self._actor_id(),
            action="admin.customer_conversation.replied",
            entity_type=AuditEntityType.CUSTOMER_CONVERSATION.value,
            entity_id=row.id,
            metadata={"reference_number": row.reference_number},
        )
        self.db.commit()
        self.db.refresh(row)
        return self.get_conversation(conversation_id)

    def assign_conversation(self, conversation_id: UUID, payload: CustomerConversationAssignmentRequest) -> CustomerConversationDetailResponse:
        row = self._require_conversation(conversation_id)
        if row.status == "closed":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Closed conversations cannot be reassigned")
        if payload.clear_assignment:
            row.assigned_admin_label = None
        elif payload.assign_to_me:
            row.assigned_admin_label = self._best_admin_label()
        elif payload.assigned_agent_label:
            row.assigned_admin_label = payload.assigned_agent_label.strip()
        else:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Choose an assignee or clear the assignment")
        AuditService.log_event(
            self.db,
            actor_role=UserRole.ADMIN,
            actor_id=self._actor_id(),
            action="admin.customer_conversation.assigned",
            entity_type=AuditEntityType.CUSTOMER_CONVERSATION.value,
            entity_id=row.id,
            metadata={"assigned_admin_label": row.assigned_admin_label},
        )
        self.db.commit()
        self.db.refresh(row)
        return self.get_conversation(conversation_id)

    def update_status(self, conversation_id: UUID, payload: CustomerConversationStatusUpdateRequest) -> CustomerConversationDetailResponse:
        row = self._require_conversation(conversation_id)
        current_status = (row.status or "").strip().lower()
        if current_status == "closed" and payload.status != "closed":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Closed conversations cannot be reopened")
        row.status = payload.status
        self._set_timestamp_for_status(row, payload.status, datetime.now(timezone.utc))
        if payload.status == "closed":
            row.unread_count = 0
            row.unread_email_alert_sent_at = None
        if payload.status == "waiting_for_customer":
            row.unread_email_alert_sent_at = None
        AuditService.log_event(
            self.db,
            actor_role=UserRole.ADMIN,
            actor_id=self._actor_id(),
            action="admin.customer_conversation.status_updated",
            entity_type=AuditEntityType.CUSTOMER_CONVERSATION.value,
            entity_id=row.id,
            metadata={"status": payload.status, "reason": payload.reason},
        )
        if payload.reason:
            self._record_message(
                row,
                sender_type="system",
                sender_label="DispatchIQ",
                body=f"Status changed to {self._status_label(payload.status)}.",
                metadata={"reason": payload.reason},
                delivered=True,
                read=True,
            )
        self.db.commit()
        self.db.refresh(row)
        return self.get_conversation(conversation_id)

    def add_internal_note(self, conversation_id: UUID, payload: CustomerConversationNoteCreateRequest) -> CustomerConversationDetailResponse:
        row = self._require_conversation(conversation_id)
        note = CustomerConversationNote(
            conversation_id=row.id,
            author_admin_id=self._actor_id(),
            author_admin_label=self._best_admin_label(),
            note_body=payload.note_body,
        )
        self.db.add(note)
        AuditService.log_event(
            self.db,
            actor_role=UserRole.ADMIN,
            actor_id=self._actor_id(),
            action="admin.customer_conversation.note_added",
            entity_type=AuditEntityType.CUSTOMER_CONVERSATION.value,
            entity_id=row.id,
            metadata={"reference_number": row.reference_number},
        )
        self.db.commit()
        self.db.refresh(row)
        return self.get_conversation(conversation_id)

    def mark_read(self, conversation_id: UUID) -> CustomerConversationDetailResponse:
        row = self._require_conversation(conversation_id)
        self._clear_unread(row)
        self.db.commit()
        self.db.refresh(row)
        return self.get_conversation(conversation_id)

    def mark_urgent(self, conversation_id: UUID) -> CustomerConversationDetailResponse:
        row = self._require_conversation(conversation_id)
        row.urgency = "urgent"
        AuditService.log_event(
            self.db,
            actor_role=UserRole.ADMIN,
            actor_id=self._actor_id(),
            action="admin.customer_conversation.urgent_marked",
            entity_type=AuditEntityType.CUSTOMER_CONVERSATION.value,
            entity_id=row.id,
            metadata={"reference_number": row.reference_number},
        )
        self.db.commit()
        self.db.refresh(row)
        return self.get_conversation(conversation_id)

    def close_conversation(self, conversation_id: UUID, reason: Optional[str] = None) -> CustomerConversationDetailResponse:
        row = self._require_conversation(conversation_id)
        row.status = "closed"
        row.closed_at = datetime.now(timezone.utc)
        row.unread_count = 0
        row.unread_email_alert_sent_at = None
        if reason:
            self._record_message(
                row,
                sender_type="system",
                sender_label="DispatchIQ",
                body="Conversation closed by admin.",
                metadata={"reason": reason},
                delivered=True,
                read=True,
            )
        AuditService.log_event(
            self.db,
            actor_role=UserRole.ADMIN,
            actor_id=self._actor_id(),
            action="admin.customer_conversation.closed",
            entity_type=AuditEntityType.CUSTOMER_CONVERSATION.value,
            entity_id=row.id,
            metadata={"reason": reason},
        )
        self.db.commit()
        self.db.refresh(row)
        return self.get_conversation(conversation_id)

    def escalate_conversation(self, conversation_id: UUID, reason: Optional[str] = None) -> CustomerConversationDetailResponse:
        row = self._require_conversation(conversation_id)
        row.status = "escalated"
        row.escalated_at = datetime.now(timezone.utc)
        if reason:
            self._record_message(
                row,
                sender_type="system",
                sender_label="DispatchIQ",
                body="Conversation escalated for manager/admin review.",
                metadata={"reason": reason},
                delivered=True,
                read=True,
            )
        AuditService.log_event(
            self.db,
            actor_role=UserRole.ADMIN,
            actor_id=self._actor_id(),
            action="admin.customer_conversation.escalated",
            entity_type=AuditEntityType.CUSTOMER_CONVERSATION.value,
            entity_id=row.id,
            metadata={"reason": reason},
        )
        self.db.commit()
        self.db.refresh(row)
        return self.get_conversation(conversation_id)

    def create_or_update_intake(
        self,
        conversation_id: UUID,
        payload: CustomerConversationIntakeUpsertRequest,
    ) -> CustomerConversationIntakeResponse:
        row = self._require_conversation(conversation_id)
        if payload.matched_service_id is None and self._service_match_ambiguous(row):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "message": "Please confirm the service match before creating intake",
                    "candidates": row.matched_service_candidates if isinstance(row.matched_service_candidates, list) else [],
                },
            )

        selected_service_id = payload.matched_service_id or row.matched_service_id
        matched_service = None
        if selected_service_id is not None:
            matched_service = self.db.query(ServiceCatalog).filter(ServiceCatalog.id == selected_service_id).first()
            if matched_service is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found")

        intake = row.intake
        if intake is None:
            intake = CustomerIntakeRecord(
                intake_number=_make_reference("INT", self.db, "intake_number", CustomerIntakeRecord),
                conversation_id=row.id,
                source_system="customer_chatbot",
            )
            self.db.add(intake)

        intake.source_system = "customer_chatbot"
        intake.status = payload.status
        intake.dealership_id = row.dealership_id
        intake.customer_name = payload.customer_name or row.customer_name
        intake.contact_person = payload.contact_person or row.contact_person
        intake.phone = payload.phone or row.phone
        intake.email = payload.email or row.email
        intake.requested_service_text = payload.requested_service_text or row.requested_service_text
        intake.matched_service_id = selected_service_id
        intake.matched_service_name = payload.matched_service_name or (matched_service.name if matched_service else row.matched_service_name)
        intake.vehicle_description = payload.vehicle_description or row.vehicle_description
        intake.vehicle_unit_or_stock_number = payload.vehicle_unit_or_stock_number or row.vehicle_unit_or_stock_number
        intake.preferred_date = payload.preferred_date or row.preferred_date
        intake.preferred_time = payload.preferred_time or row.preferred_time
        intake.location_branch = payload.location_branch or row.service_location_or_branch
        intake.urgency = _map_request_urgency(payload.urgency)
        intake.notes = payload.notes or row.special_notes
        intake.created_by_admin_id = intake.created_by_admin_id or self._actor_id()
        intake.created_by_admin_label = intake.created_by_admin_label or self._best_admin_label()
        intake.updated_by_admin_id = self._actor_id()
        intake.updated_by_admin_label = self._best_admin_label()
        intake.conversation_id = row.id

        row.status = "intake_created"
        row.unread_count = 0
        row.unread_email_alert_sent_at = None
        row.last_activity_at = datetime.now(timezone.utc)
        row.source_metadata = {
            **_safe_dict(row.source_metadata),
            "intake_id": str(intake.id),
            "intake_number": intake.intake_number,
            "intake_status": payload.status,
        }
        self._record_message(
            row,
            sender_type="system",
            sender_label="DispatchIQ",
            body="Intake record created for dispatch review.",
            metadata={"intake_number": intake.intake_number},
            delivered=True,
            read=True,
        )
        AuditService.log_event(
            self.db,
            actor_role=UserRole.ADMIN,
            actor_id=self._actor_id(),
            action="admin.customer_conversation.intake_created",
            entity_type=AuditEntityType.CUSTOMER_CONVERSATION.value,
            entity_id=row.id,
            metadata={"intake_number": intake.intake_number},
        )
        self.db.commit()
        self.db.refresh(intake)
        return self._serialize_intake(intake)

    def link_existing_intake(self, conversation_id: UUID, payload: CustomerConversationLinkIntakeRequest) -> CustomerConversationDetailResponse:
        row = self._require_conversation(conversation_id)
        if payload.intake_id is not None:
            intake = self._require_intake(payload.intake_id)
        elif payload.intake_number:
            intake = self._find_intake_by_number(payload.intake_number)
        else:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="intake_id or intake_number is required")
        if intake.conversation_id is not None and intake.conversation_id != row.id:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Intake is already linked to another conversation")
        intake.conversation_id = row.id
        intake.updated_by_admin_id = self._actor_id()
        intake.updated_by_admin_label = self._best_admin_label()
        row.status = "intake_created"
        row.unread_count = 0
        row.unread_email_alert_sent_at = None
        self.db.commit()
        self.db.refresh(row)
        return self.get_conversation(conversation_id)

    def link_existing_job(self, conversation_id: UUID, payload: CustomerConversationLinkJobRequest) -> CustomerConversationDetailResponse:
        row = self._require_conversation(conversation_id)
        if payload.job_id is not None:
            job = self._require_job(payload.job_id)
        elif payload.job_code:
            job = self._find_job_by_code(payload.job_code)
        else:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="job_id or job_code is required")
        row.linked_job_id = job.id
        row.status = "converted_to_job"
        if row.intake is not None:
            row.intake.linked_job_id = job.id
            row.intake.status = "converted"
        self.db.commit()
        self.db.refresh(row)
        return self.get_conversation(conversation_id)

    def convert_to_job(self, conversation_id: UUID, payload: CustomerConversationConvertToJobRequest) -> CustomerConversationJobLinkResponse:
        row = self._require_conversation(conversation_id)
        if row.linked_job is not None and row.status == "converted_to_job":
            return self._serialize_job_link(row.linked_job)

        intake = row.intake
        if payload.create_intake_first and intake is None:
            intake = self._create_intake_for_conversion(row, payload)

        dealership = self._find_dealership(payload.dealership_name or row.dealership_name or row.customer_name, row.phone, row.email)
        service_names = [item.strip() for item in payload.service_names if isinstance(item, str) and item.strip()]
        if payload.service_name:
            service_names.insert(0, payload.service_name.strip())
        if not service_names:
            if intake and intake.matched_service_name:
                service_names = [intake.matched_service_name]
            elif row.matched_service_name:
                service_names = [row.matched_service_name]
            elif row.requested_service_text:
                service_names = [row.requested_service_text]
            else:
                service_names = ["Customer request"]

        try:
            normalized_service_names = JobServicesService(self.db)._normalize_service_names(service_names)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

        job_row = Job(
            job_code=_make_reference("DIQ-CX", self.db, "job_code", Job),
            status=db_status_from_dispatch_status(DispatchJobStatus.ADMIN_PREVIEW),
            dealership_id=dealership.id if dealership is not None else row.dealership_id,
            customer_name=dealership.name if dealership else payload.dealership_name or row.customer_name,
            service_type=normalized_service_names[0],
            vehicle=payload.vehicle_summary
            or (intake.vehicle_description if intake else row.vehicle_description)
            or row.vehicle_description,
            requested_service_date=payload.requested_service_date or (intake.preferred_date if intake else row.preferred_date),
            requested_service_time=payload.requested_service_time or (intake.preferred_time if intake else row.preferred_time),
            source_system="customer_conversation",
            source_metadata={
                "source": "customer_conversation",
                "conversation_id": str(row.id),
                "conversation_reference_number": row.reference_number,
                "intake_id": str(intake.id) if intake else None,
                "intake_number": intake.intake_number if intake else None,
                "source_channel": row.source_channel,
                "urgency": row.urgency,
                "notes": payload.notes or row.special_notes,
                "dealership_name": payload.dealership_name or row.dealership_name or row.customer_name,
            },
        )
        self.db.add(job_row)
        self.db.flush()
        JobServicesService(self.db).replace_services(
            job=job_row,
            service_names=normalized_service_names,
            source="admin",
            created_by_user_id=self._actor_id(),
        )
        if payload.pre_assigned_technician_id is not None:
            tech = self.db.query(Technician).filter(Technician.id == payload.pre_assigned_technician_id).first()
            if tech is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Technician not found")
            if (tech.status or "").strip().lower() != "active":
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Technician is not active")
            job_row.pre_assigned_technician_id = tech.id
            job_row.pre_assignment_reason = "manual_admin_assignment"

        if intake is not None:
            intake.linked_job_id = job_row.id
            intake.status = "converted"

        row.linked_job_id = job_row.id
        row.status = "converted_to_job"
        row.unread_count = 0
        row.unread_email_alert_sent_at = None
        row.last_activity_at = datetime.now(timezone.utc)
        row.source_metadata = {
            **_safe_dict(row.source_metadata),
            "job_id": str(job_row.id),
            "job_code": job_row.job_code,
            "converted_at": datetime.now(timezone.utc).isoformat(),
        }
        self._record_message(
            row,
            sender_type="system",
            sender_label="DispatchIQ",
            body=f"Conversation converted to job {job_row.job_code}.",
            metadata={"job_code": job_row.job_code},
            delivered=True,
            read=True,
        )
        AuditService.log_event(
            self.db,
            actor_role=UserRole.ADMIN,
            actor_id=self._actor_id(),
            action="admin.customer_conversation.converted_to_job",
            entity_type=AuditEntityType.CUSTOMER_CONVERSATION.value,
            entity_id=row.id,
            metadata={"job_code": job_row.job_code, "intake_number": intake.intake_number if intake else None},
        )
        self.db.commit()
        self.db.refresh(job_row)
        return self._serialize_job_link(job_row)

    def _create_intake_for_conversion(
        self,
        row: CustomerConversation,
        payload: CustomerConversationConvertToJobRequest,
    ) -> CustomerIntakeRecord:
        intake = CustomerIntakeRecord(
            intake_number=_make_reference("INT", self.db, "intake_number", CustomerIntakeRecord),
            conversation_id=row.id,
            source_system="customer_chatbot",
            status="reviewed",
            dealership_id=row.dealership_id,
            customer_name=row.customer_name,
            contact_person=row.contact_person,
            phone=row.phone,
            email=row.email,
            requested_service_text=row.requested_service_text,
            matched_service_id=row.matched_service_id,
            matched_service_name=row.matched_service_name,
            vehicle_description=row.vehicle_description,
            vehicle_unit_or_stock_number=row.vehicle_unit_or_stock_number,
            preferred_date=row.preferred_date,
            preferred_time=row.preferred_time,
            location_branch=row.service_location_or_branch,
            urgency=row.urgency,
            notes=row.special_notes or payload.notes,
            created_by_admin_id=self._actor_id(),
            created_by_admin_label=self._best_admin_label(),
            updated_by_admin_id=self._actor_id(),
            updated_by_admin_label=self._best_admin_label(),
        )
        self.db.add(intake)
        self.db.flush()
        return intake
