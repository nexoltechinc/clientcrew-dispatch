from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from ...api import deps
from ...core.enums import UserRole
from ...core.security import AuthenticatedUser
from ...schemas.invoice import (
    InvoiceApprovalDraftSaveRequest,
    InvoiceCreateRequest,
    InvoiceMarkPaidRequest,
    InvoicePendingApprovalIssueResponse,
    InvoicePendingApprovalResponse,
    InvoiceResponse,
    InvoiceUpdateRequest,
)
from ...services.invoice_service import InvoiceService

router = APIRouter(prefix="/invoices", tags=["invoices"])


@router.get("", response_model=List[InvoiceResponse])
def list_invoices(
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    return InvoiceService(db, current_user).list_invoices()


@router.get("/pending-approvals", response_model=List[InvoicePendingApprovalResponse])
def list_pending_invoice_approvals(
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    return InvoiceService(db, current_user).list_pending_approvals()


@router.get("/pending-approval-issues", response_model=List[InvoicePendingApprovalIssueResponse])
def list_pending_invoice_approval_issues(
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    return InvoiceService(db, current_user).list_pending_approval_issues()


@router.put("/pending-approvals/{job_id}/draft", response_model=InvoicePendingApprovalResponse)
def save_pending_invoice_approval_draft(
    job_id: UUID,
    payload: InvoiceApprovalDraftSaveRequest,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    return InvoiceService(db, current_user).save_pending_approval_draft(job_id, payload)


@router.post("", response_model=InvoiceResponse, status_code=status.HTTP_201_CREATED)
def create_invoice(
    payload: InvoiceCreateRequest,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    return InvoiceService(db, current_user).create_invoice(payload)


@router.get("/{invoice_id}", response_model=InvoiceResponse)
def get_invoice(
    invoice_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    return InvoiceService(db, current_user).get_invoice(invoice_id)


@router.put("/{invoice_id}", response_model=InvoiceResponse)
def update_invoice(
    invoice_id: UUID,
    payload: InvoiceUpdateRequest,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    return InvoiceService(db, current_user).update_invoice(invoice_id, payload)


@router.delete("/{invoice_id}", response_model=InvoiceResponse)
def void_invoice(
    invoice_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    return InvoiceService(db, current_user).void_invoice(invoice_id)


@router.post("/{invoice_id}/mark-paid", response_model=InvoiceResponse)
def mark_invoice_paid(
    invoice_id: UUID,
    payload: InvoiceMarkPaidRequest,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    return InvoiceService(db, current_user).mark_invoice_paid(
        invoice_id,
        payment_recorded_at=payload.payment_recorded_at,
    )
