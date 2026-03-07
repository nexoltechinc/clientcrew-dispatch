import re
from typing import Iterable, List, Optional
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from ..models.dealership import Dealership
from ..models.invoice import Invoice
from ..models.invoice_approval_draft import InvoiceApprovalDraft
from ..models.job import Job
from ..models.technician import Technician


INVOICE_NUMBER_PATTERN = re.compile(r"^INV-(\d+)$", re.IGNORECASE)


class InvoiceRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, invoice_id: UUID) -> Optional[Invoice]:
        return (
            self.db.query(Invoice)
            .options(selectinload(Invoice.line_items))
            .filter(Invoice.id == invoice_id)
            .first()
        )

    def get_by_number(self, invoice_number: str) -> Optional[Invoice]:
        normalized = invoice_number.strip().upper()
        return self.db.query(Invoice).filter(Invoice.invoice_number == normalized).first()

    def list(self) -> List[Invoice]:
        return (
            self.db.query(Invoice)
            .options(selectinload(Invoice.line_items))
            .order_by(Invoice.invoice_date.desc(), Invoice.created_at.desc())
            .all()
        )

    def generate_next_invoice_number(self) -> str:
        max_number = 0
        for row in self.db.query(Invoice.invoice_number).all():
            value = str(row[0] or "").strip().upper()
            match = INVOICE_NUMBER_PATTERN.match(value)
            if not match:
                continue
            parsed = int(match.group(1))
            if parsed > max_number:
                max_number = parsed
        return f"INV-{max_number + 1:04d}"

    def create(self, invoice: Invoice) -> Invoice:
        self.db.add(invoice)
        self.db.flush()
        self.db.refresh(invoice)
        return invoice

    def update(self, invoice: Invoice) -> Invoice:
        self.db.flush()
        self.db.refresh(invoice)
        return invoice

    def get_jobs_by_ids(self, job_ids: Iterable[UUID]) -> List[Job]:
        ids = list(job_ids)
        if not ids:
            return []
        return (
            self.db.query(Job)
            .options(selectinload(Job.invoice))
            .filter(Job.id.in_(ids))
            .all()
        )

    def get_dealership_by_id(self, dealership_id: UUID) -> Optional[Dealership]:
        return self.db.query(Dealership).filter(Dealership.id == dealership_id).first()

    def set_jobs_invoice(self, job_ids: Iterable[UUID], invoice_id: Optional[UUID]) -> None:
        ids = list(job_ids)
        if not ids:
            return
        self.db.query(Job).filter(Job.id.in_(ids)).update(
            {"invoice_id": invoice_id},
            synchronize_session=False,
        )

    def clear_jobs_for_invoice(self, invoice_id: UUID) -> None:
        self.db.query(Job).filter(Job.invoice_id == invoice_id).update(
            {"invoice_id": None},
            synchronize_session=False,
        )

    def list_pending_approval_jobs(self) -> List[tuple[Job, Optional[Dealership], Optional[Technician]]]:
        return (
            self.db.query(Job, Dealership, Technician)
            .outerjoin(Dealership, Job.dealership_id == Dealership.id)
            .outerjoin(Technician, Job.assigned_tech_id == Technician.id)
            .filter(Job.invoice_id.is_(None))
            .filter(func.upper(Job.status) == "COMPLETED")
            .order_by(Job.completed_at.desc(), Job.created_at.desc())
            .all()
        )

    def get_pending_approval_draft(self, job_id: UUID) -> Optional[InvoiceApprovalDraft]:
        return self.db.query(InvoiceApprovalDraft).filter(InvoiceApprovalDraft.job_id == job_id).first()

    def list_pending_approval_drafts(self, job_ids: Iterable[UUID]) -> List[InvoiceApprovalDraft]:
        ids = list(job_ids)
        if not ids:
            return []
        return self.db.query(InvoiceApprovalDraft).filter(InvoiceApprovalDraft.job_id.in_(ids)).all()

    def upsert_pending_approval_draft(self, job_id: UUID, line_items: List[dict]) -> InvoiceApprovalDraft:
        row = self.get_pending_approval_draft(job_id)
        if row is None:
            row = InvoiceApprovalDraft(job_id=job_id, line_items=line_items)
            self.db.add(row)
        else:
            row.line_items = line_items
        self.db.flush()
        self.db.refresh(row)
        return row

    def delete_pending_approval_draft(self, job_id: UUID) -> None:
        self.db.query(InvoiceApprovalDraft).filter(InvoiceApprovalDraft.job_id == job_id).delete(synchronize_session=False)
