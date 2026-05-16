from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from ...api import deps
from ...core.enums import UserRole
from ...core.security import AuthenticatedUser
from ...schemas.customer_conversations import (
    CustomerConversationAssignmentRequest,
    CustomerConversationConvertToJobRequest,
    CustomerConversationDetailResponse,
    CustomerConversationIntakeResponse,
    CustomerConversationIntakeUpsertRequest,
    CustomerConversationLinkIntakeRequest,
    CustomerConversationLinkJobRequest,
    CustomerConversationListItemResponse,
    CustomerConversationMessageResponse,
    CustomerConversationNoteCreateRequest,
    CustomerConversationReplyRequest,
    CustomerConversationStatusUpdateRequest,
    CustomerConversationSummaryResponse,
)
from ...services.customer_conversation_service import CustomerConversationService

router = APIRouter(prefix="/admin/customer-conversations", tags=["admin-customer-conversations"])


def _service(db: Session, current_user: AuthenticatedUser) -> CustomerConversationService:
    return CustomerConversationService(db, current_user)


@router.get("", response_model=list[CustomerConversationListItemResponse])
def list_customer_conversations(
    status_filter: str | None = Query(default=None, alias="status"),
    assigned_agent: str | None = Query(default=None),
    urgency: str | None = Query(default=None),
    service_type: str | None = Query(default=None),
    source_channel: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    unread_only: bool = Query(default=False),
    search: str | None = Query(default=None, max_length=255),
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    return _service(db, current_user).list_conversations(
        status_filter=status_filter,
        assigned_agent=assigned_agent,
        urgency=urgency,
        service_type=service_type,
        source_channel=source_channel,
        date_from=date_from,
        date_to=date_to,
        unread_only=unread_only,
        search=search,
    )


@router.get("/summary", response_model=CustomerConversationSummaryResponse)
def get_customer_conversations_summary(
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    return _service(db, current_user).get_summary()


@router.get("/{conversation_id}", response_model=CustomerConversationDetailResponse)
def get_customer_conversation(
    conversation_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    return _service(db, current_user).get_conversation(conversation_id)


@router.get("/{conversation_id}/messages", response_model=list[CustomerConversationMessageResponse])
def list_customer_conversation_messages(
    conversation_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    return _service(db, current_user).list_messages(conversation_id)


@router.post("/{conversation_id}/messages", response_model=CustomerConversationDetailResponse)
def reply_to_customer_conversation(
    conversation_id: UUID,
    payload: CustomerConversationReplyRequest,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    return _service(db, current_user).reply_to_conversation(conversation_id, payload)


@router.post("/{conversation_id}/join", response_model=CustomerConversationDetailResponse)
def join_customer_conversation(
    conversation_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    return _service(db, current_user).join_conversation(conversation_id)


@router.patch("/{conversation_id}/assignment", response_model=CustomerConversationDetailResponse)
def assign_customer_conversation(
    conversation_id: UUID,
    payload: CustomerConversationAssignmentRequest,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    return _service(db, current_user).assign_conversation(conversation_id, payload)


@router.patch("/{conversation_id}/status", response_model=CustomerConversationDetailResponse)
def update_customer_conversation_status(
    conversation_id: UUID,
    payload: CustomerConversationStatusUpdateRequest,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    return _service(db, current_user).update_status(conversation_id, payload)


@router.post("/{conversation_id}/read", response_model=CustomerConversationDetailResponse)
def mark_customer_conversation_read(
    conversation_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    return _service(db, current_user).mark_read(conversation_id)


@router.post("/{conversation_id}/internal-notes", response_model=CustomerConversationDetailResponse)
def add_customer_conversation_note(
    conversation_id: UUID,
    payload: CustomerConversationNoteCreateRequest,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    return _service(db, current_user).add_internal_note(conversation_id, payload)


@router.post("/{conversation_id}/mark-urgent", response_model=CustomerConversationDetailResponse)
def mark_customer_conversation_urgent(
    conversation_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    return _service(db, current_user).mark_urgent(conversation_id)


@router.post("/{conversation_id}/close", response_model=CustomerConversationDetailResponse)
def close_customer_conversation(
    conversation_id: UUID,
    reason: str | None = Query(default=None, max_length=1000),
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    return _service(db, current_user).close_conversation(conversation_id, reason=reason)


@router.post("/{conversation_id}/escalate", response_model=CustomerConversationDetailResponse)
def escalate_customer_conversation(
    conversation_id: UUID,
    reason: str | None = Query(default=None, max_length=1000),
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    return _service(db, current_user).escalate_conversation(conversation_id, reason=reason)


@router.post("/{conversation_id}/intake", response_model=CustomerConversationIntakeResponse, status_code=status.HTTP_201_CREATED)
def create_or_update_customer_intake(
    conversation_id: UUID,
    payload: CustomerConversationIntakeUpsertRequest,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    return _service(db, current_user).create_or_update_intake(conversation_id, payload)


@router.post("/{conversation_id}/link-intake", response_model=CustomerConversationDetailResponse)
def link_existing_customer_intake(
    conversation_id: UUID,
    payload: CustomerConversationLinkIntakeRequest,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    return _service(db, current_user).link_existing_intake(conversation_id, payload)


@router.post("/{conversation_id}/link-job", response_model=CustomerConversationDetailResponse)
def link_existing_customer_job(
    conversation_id: UUID,
    payload: CustomerConversationLinkJobRequest,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    return _service(db, current_user).link_existing_job(conversation_id, payload)


@router.post("/{conversation_id}/convert-to-job", response_model=CustomerConversationDetailResponse)
def convert_customer_conversation_to_job(
    conversation_id: UUID,
    payload: CustomerConversationConvertToJobRequest,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    service = _service(db, current_user)
    service.convert_to_job(conversation_id, payload)
    return service.get_conversation(conversation_id)
