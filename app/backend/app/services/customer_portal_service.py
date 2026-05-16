from __future__ import annotations

import json
import re
import unicodedata
from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy.orm import Session, selectinload

from ..core.config import COMPANY_PRIMARY_COLOR
from ..core.job_status import normalize_dispatch_job_status
from ..models.dealership import Dealership
from ..models.invoice import Invoice
from ..models.job import Job
from ..schemas.customer_portal import (
    CustomerBrandingResponse,
    CustomerInvoiceLookupResponse,
    CustomerInvoiceLookupResult,
    CustomerJobLookupResponse,
    CustomerJobLookupResult,
    CustomerServiceCatalogItemResponse,
    CustomerServiceRequestCreateRequest,
    CustomerServiceRequestResponse,
)
from ..schemas.job_intake import MakeDealershipPayload, MakeJobIntakeItem
from .customer_conversation_service import CustomerConversationService
from .invoice_branding_settings_service import InvoiceBrandingSettingsService
from .job_workflow_service import JobWorkflowService
from .service_catalog_service import ServiceCatalogService


PHONE_DIGIT_RE = re.compile(r"\D+")

JOB_STATUS_LABELS: dict[str, str] = {
    "admin_review": "Received and under review",
    "admin_preview": "Received and under review",
    "ready_for_tech": "Ready to assign",
    "pending_admin_confirmation": "Waiting for confirmation",
    "pending_review": "Received and under review",
    "pending": "Pending assignment",
    "scheduled": "Scheduled",
    "in_progress": "In progress",
    "delayed": "Delayed",
    "completed": "Completed",
    "cancelled": "Cancelled",
}

JOB_NEXT_STEP: dict[str, str] = {
    "admin_review": "Dispatch/admin will review the request and follow up shortly.",
    "admin_preview": "Dispatch/admin will review the request and follow up shortly.",
    "ready_for_tech": "The request is ready for dispatch to assign.",
    "pending_admin_confirmation": "Dispatch/admin is confirming the next step.",
    "pending_review": "Dispatch/admin will review the request next.",
    "pending": "The request is in the dispatch queue.",
    "scheduled": "Your job has been scheduled. Dispatch will contact you if anything changes.",
    "in_progress": "Work is underway. Please keep the vehicle and location available.",
    "delayed": "Dispatch is reviewing the delay and will follow up.",
    "completed": "The job is complete. If you have billing questions, use the support tab.",
    "cancelled": "This request is no longer active.",
}

INVOICE_STATUS_LABELS: dict[str, str] = {
    "draft": "Invoice is being prepared",
    "sent": "Invoice has been issued",
    "paid": "Payment was recorded",
    "overdue": "The due date has passed",
    "cancelled": "Invoice is no longer active",
}

INVOICE_NEXT_STEP: dict[str, str] = {
    "draft": "Please wait while dispatch finalizes the invoice.",
    "sent": "You can review the invoice and contact dispatch with questions.",
    "paid": "No further action is needed unless you have a question for dispatch.",
    "overdue": "Please contact dispatch/admin if you need help resolving payment.",
    "cancelled": "This invoice is closed. If you still need help, contact dispatch.",
}


def _normalize_text(value: Optional[str]) -> str:
    if not value:
        return ""
    normalized = unicodedata.normalize("NFD", value.strip().lower())
    return "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")


def _normalize_phone(value: Optional[str]) -> str:
    if not value:
        return ""
    return PHONE_DIGIT_RE.sub("", value)


def _friendly_job_status(value: Optional[str]) -> str:
    normalized = (value or "").strip().lower()
    return JOB_STATUS_LABELS.get(normalized, "Received and under review")


def _friendly_job_next_step(value: Optional[str]) -> str:
    normalized = (value or "").strip().lower()
    return JOB_NEXT_STEP.get(normalized, "Dispatch/admin will review the request and follow up shortly.")


def _friendly_invoice_status(value: Optional[str]) -> str:
    normalized = (value or "").strip().lower()
    return INVOICE_STATUS_LABELS.get(normalized, "Invoice is being prepared")


def _friendly_invoice_next_step(value: Optional[str]) -> str:
    normalized = (value or "").strip().lower()
    return INVOICE_NEXT_STEP.get(normalized, "Please contact dispatch/admin with any questions.")


def _build_summary(service_summary: str, vehicle_summary: str, customer_name: str) -> str:
    service_text = service_summary or "your request"
    vehicle_text = vehicle_summary or "the vehicle details on file"
    customer_text = customer_name or "the customer"
    return f"{customer_text}: {service_text} for {vehicle_text}."


class CustomerPortalService:
    def __init__(self, db: Session):
        self.db = db

    def get_branding(self) -> CustomerBrandingResponse:
        payload = InvoiceBrandingSettingsService(self.db).get_invoice_branding()
        return CustomerBrandingResponse(
            logo_url=payload.logo_url,
            name=payload.name,
            street_address=payload.street_address,
            city=payload.city,
            state=payload.state,
            zip_code=payload.zip_code,
            phone=payload.phone,
            email=payload.email,
            website=payload.website,
            primary_color=COMPANY_PRIMARY_COLOR,
        )

    def list_services(self) -> list[CustomerServiceCatalogItemResponse]:
        services = ServiceCatalogService(self.db).list_active_services()
        return [
            CustomerServiceCatalogItemResponse(
                id=row.id,
                code=row.code,
                name=row.name,
                description=row.description,
                category=row.category,
                default_price=row.default_price,
                approval_required=row.approval_required,
                status=row.status,
                updated_at=row.updated_at,
            )
            for row in services
        ]

    def submit_request(self, payload: CustomerServiceRequestCreateRequest) -> CustomerServiceRequestResponse:
        requested_services = [item.strip() for item in payload.requested_services if isinstance(item, str) and item.strip()]
        service_text = (payload.requested_service_text or "").strip()

        if not requested_services and not service_text:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="requested_services or requested_service_text is required",
            )

        existing = self._find_existing_request_by_idempotency(payload.idempotency_key)
        if existing is not None:
            return self._to_request_response(existing)

        request_seed = payload.idempotency_key or f"CP-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{uuid4().hex[:6].upper()}"
        service_descriptor = self._service_descriptor(requested_services, service_text)

        intake_payload = MakeJobIntakeItem(
            job_id=request_seed,
            dealership=MakeDealershipPayload(
                dealership_name=payload.customer_name,
                telephone=payload.phone,
                service=service_descriptor,
            ),
            vehicle=payload.vehicle_description,
            vehicle_number=payload.vehicle_unit_or_stock_number,
            date=payload.preferred_date,
            time=payload.preferred_time,
            urgent=payload.urgency in {"high", "critical"},
            confidence=None,
            flags=[flag for flag in [payload.urgency.upper(), "CUSTOMER_PORTAL"] if flag],
            raw=json.dumps(payload.model_dump(mode="json"), ensure_ascii=False, separators=(",", ":")),
        )

        workflow = JobWorkflowService(self.db)
        row = workflow.upsert_jobs_from_make(
            [intake_payload],
            source_system="customer-portal",
            dealership_notes="Auto-created from customer portal intake",
        )[0].row

        source_metadata = dict(row.source_metadata or {})
        source_metadata["portal"] = {
            "request_type": "service_request",
            "customer_name": payload.customer_name,
            "contact_person": payload.contact_person,
            "phone": payload.phone,
            "email": payload.email,
            "vehicle_description": payload.vehicle_description,
            "vehicle_unit_or_stock_number": payload.vehicle_unit_or_stock_number,
            "requested_services": requested_services,
            "requested_service_text": service_text or None,
            "preferred_date": payload.preferred_date.isoformat(),
            "preferred_time": payload.preferred_time.isoformat(),
            "service_location_or_branch": payload.service_location_or_branch,
            "urgency": payload.urgency,
            "special_notes": payload.special_notes,
            "portal_session_id": payload.portal_session_id,
            "idempotency_key": payload.idempotency_key,
            "service_descriptor": service_descriptor,
        }
        row.source_system = "customer-portal"
        row.source_metadata = source_metadata
        self.db.commit()
        self.db.refresh(row)

        dealership_row = None
        if row.dealership_id is not None:
            dealership_row = self.db.query(Dealership).filter(Dealership.id == row.dealership_id).first()
        CustomerConversationService(self.db).register_service_request(
            payload=payload,
            job_row=row,
            dealership=dealership_row,
        )
        return self._to_request_response(row, customer_name=payload.customer_name)

    def lookup_jobs(
        self,
        *,
        job_code: Optional[str] = None,
        customer_name: Optional[str] = None,
        contact_email: Optional[str] = None,
        contact_phone: Optional[str] = None,
    ) -> CustomerJobLookupResponse:
        normalized_job_code = _normalize_text(job_code)
        normalized_name = _normalize_text(customer_name)
        normalized_email = _normalize_text(contact_email)
        normalized_phone = _normalize_phone(contact_phone)

        if not any([normalized_job_code, normalized_name, normalized_email, normalized_phone]):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Provide a job_code or customer details to look up status",
            )

        jobs = (
            self.db.query(Job)
            .options(selectinload(Job.job_services))
            .order_by(Job.created_at.desc())
            .all()
        )
        dealerships = {row.id: row for row in self.db.query(Dealership).all()}

        matches: list[CustomerJobLookupResult] = []
        for row in jobs:
            dealership = dealerships.get(row.dealership_id) if row.dealership_id is not None else None
            if normalized_job_code and _normalize_text(row.job_code) != normalized_job_code:
                continue
            if normalized_name and not self._matches_customer_name(row, dealership, normalized_name):
                continue
            if normalized_email and not self._matches_contact(row, dealership, normalized_email, kind="email"):
                continue
            if normalized_phone and not self._matches_contact(row, dealership, normalized_phone, kind="phone"):
                continue

            matches.append(self._to_job_lookup_result(row, dealership))
            if normalized_job_code:
                break

        found = len(matches) > 0
        multiple = len(matches) > 1
        if found:
            message = (
                "We found more than one matching request. Please confirm the dealership name or contact details."
                if multiple
                else "We found your request."
            )
        else:
            message = "No matching request was found. Please double-check the job code or contact dispatch."

        query_parts = [part for part in [job_code, customer_name, contact_email, contact_phone] if part]
        return CustomerJobLookupResponse(
            found=found,
            multiple_matches=multiple,
            message=message,
            query=" · ".join(query_parts) if query_parts else "",
            matches=matches[:5],
        )

    def lookup_invoices(
        self,
        *,
        invoice_number: Optional[str] = None,
        job_code: Optional[str] = None,
        customer_name: Optional[str] = None,
        contact_email: Optional[str] = None,
        contact_phone: Optional[str] = None,
    ) -> CustomerInvoiceLookupResponse:
        normalized_invoice_number = _normalize_text(invoice_number)
        normalized_job_code = _normalize_text(job_code)
        normalized_name = _normalize_text(customer_name)
        normalized_email = _normalize_text(contact_email)
        normalized_phone = _normalize_phone(contact_phone)

        if not any([normalized_invoice_number, normalized_job_code, normalized_name, normalized_email, normalized_phone]):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Provide an invoice number, job code, or customer details to look up billing",
            )

        invoices = (
            self.db.query(Invoice)
            .options(selectinload(Invoice.line_items), selectinload(Invoice.jobs))
            .order_by(Invoice.created_at.desc())
            .all()
        )
        dealerships = {row.id: row for row in self.db.query(Dealership).all()}

        matches: list[CustomerInvoiceLookupResult] = []
        for row in invoices:
            primary_job = row.jobs[0] if row.jobs else None
            dealership = dealerships.get(primary_job.dealership_id) if primary_job and primary_job.dealership_id is not None else None

            if normalized_invoice_number and _normalize_text(row.invoice_number) != normalized_invoice_number:
                continue
            if normalized_job_code and not self._invoice_matches_job_code(row, normalized_job_code):
                continue
            if normalized_name and not self._matches_invoice_name(row, dealership, normalized_name):
                continue
            if normalized_email and not self._matches_invoice_contact(row, dealership, normalized_email, kind="email"):
                continue
            if normalized_phone and not self._matches_invoice_contact(row, dealership, normalized_phone, kind="phone"):
                continue

            matches.append(self._to_invoice_lookup_result(row, primary_job, dealership))
            if normalized_invoice_number:
                break

        found = len(matches) > 0
        multiple = len(matches) > 1
        if found:
            message = (
                "We found more than one billing record. Please confirm the invoice number."
                if multiple
                else "We found your invoice."
            )
        else:
            message = "No matching invoice was found. Please contact dispatch/admin if you need help."

        query_parts = [part for part in [invoice_number, job_code, customer_name, contact_email, contact_phone] if part]
        return CustomerInvoiceLookupResponse(
            found=found,
            multiple_matches=multiple,
            message=message,
            query=" · ".join(query_parts) if query_parts else "",
            matches=matches[:5],
        )

    def _service_descriptor(self, requested_services: list[str], requested_service_text: str) -> str:
        if requested_services:
            return ", ".join(requested_services)
        return requested_service_text or "Customer request"

    def _find_existing_request_by_idempotency(self, idempotency_key: Optional[str]) -> Job | None:
        if not idempotency_key:
            return None

        rows = (
            self.db.query(Job)
            .filter(Job.source_system == "customer-portal")
            .order_by(Job.created_at.desc())
            .all()
        )
        for row in rows:
            source_metadata = row.source_metadata if isinstance(row.source_metadata, dict) else {}
            portal_metadata = source_metadata.get("portal") if isinstance(source_metadata, dict) else None
            if isinstance(portal_metadata, dict) and portal_metadata.get("idempotency_key") == idempotency_key:
                return row
            if source_metadata.get("idempotency_key") == idempotency_key:
                return row
        return None

    def _to_request_response(self, row: Job, *, customer_name: Optional[str] = None) -> CustomerServiceRequestResponse:
        dealership = self.db.query(Dealership).filter(Dealership.id == row.dealership_id).first() if row.dealership_id else None
        service_summary = self._service_summary(row)
        vehicle_summary = row.vehicle or "Vehicle details on file"
        status_key = (row.status or "").strip().lower()
        friendly_status = _friendly_job_status(status_key)
        reference = row.job_code
        resolved_customer_name = (customer_name or row.customer_name or (dealership.name if dealership else "") or "Customer").strip()
        return CustomerServiceRequestResponse(
            request_id=row.id,
            reference_number=reference,
            job_code=reference,
            status=friendly_status,
            status_label=friendly_status,
            summary=_build_summary(
                service_summary,
                vehicle_summary,
                resolved_customer_name,
            ),
            next_step=_friendly_job_next_step(status_key),
            submitted_at=row.created_at,
            customer_name=resolved_customer_name,
            service_summary=service_summary,
            vehicle_summary=vehicle_summary,
            agent_available=False,
        )

    def _to_job_lookup_result(self, row: Job, dealership: Dealership | None) -> CustomerJobLookupResult:
        status_key = (row.status or "").strip().lower()
        friendly_status = _friendly_job_status(status_key)
        service_summary = self._service_summary(row)
        vehicle_summary = row.vehicle or "Vehicle details on file"
        customer_name = (row.customer_name or (dealership.name if dealership else "") or "Customer").strip()
        return CustomerJobLookupResult(
            reference_number=row.job_code,
            job_code=row.job_code,
            status=friendly_status,
            status_label=friendly_status,
            summary=_build_summary(service_summary, vehicle_summary, customer_name),
            service_summary=service_summary,
            vehicle_summary=vehicle_summary,
            next_step=_friendly_job_next_step(status_key),
            requested_service_date=row.requested_service_date,
            requested_service_time=row.requested_service_time,
            updated_at=row.updated_at,
        )

    def _to_invoice_lookup_result(
        self,
        row: Invoice,
        job: Job | None,
        dealership: Dealership | None,
    ) -> CustomerInvoiceLookupResult:
        status_key = (row.status or "").strip().lower()
        friendly_status = _friendly_invoice_status(status_key)
        customer_name = (row.bill_to_name or (dealership.name if dealership else "") or "Customer").strip()
        summary = f"{row.invoice_number} for {customer_name}."
        return CustomerInvoiceLookupResult(
            invoice_number=row.invoice_number,
            job_code=job.job_code if job else None,
            status=friendly_status,
            status_label=friendly_status,
            summary=summary,
            total=row.total,
            due_date=row.due_date,
            next_step=_friendly_invoice_next_step(status_key),
            updated_at=row.updated_at,
        )

    def _service_summary(self, row: Job) -> str:
        service_names = [
            item.service_name_snapshot.strip()
            for item in row.job_services
            if item.service_name_snapshot and item.service_name_snapshot.strip()
        ]
        if service_names:
            return ", ".join(service_names[:3])

        if row.service_type and row.service_type.strip():
            return row.service_type.strip()

        source_metadata = row.source_metadata if isinstance(row.source_metadata, dict) else {}
        portal = source_metadata.get("portal") if isinstance(source_metadata, dict) else None
        if isinstance(portal, dict):
            requested = portal.get("requested_services")
            if isinstance(requested, list):
                cleaned = [str(item).strip() for item in requested if str(item).strip()]
                if cleaned:
                    return ", ".join(cleaned)
            descriptor = portal.get("service_descriptor")
            if isinstance(descriptor, str) and descriptor.strip():
                return descriptor.strip()

        return "Customer request"

    def _matches_customer_name(self, row: Job, dealership: Dealership | None, normalized_name: str) -> bool:
        candidates = [row.customer_name, dealership.name if dealership else None]
        for candidate in candidates:
            normalized_candidate = _normalize_text(candidate)
            if normalized_candidate == normalized_name:
                return True
            if normalized_name and normalized_name in normalized_candidate:
                return True
        return False

    def _matches_contact(self, row: Job, dealership: Dealership | None, normalized_value: str, *, kind: str) -> bool:
        source_metadata = row.source_metadata if isinstance(row.source_metadata, dict) else {}
        portal = source_metadata.get("portal") if isinstance(source_metadata, dict) else None
        candidates = [dealership.phone if dealership else None, dealership.email if dealership else None]
        if isinstance(portal, dict):
            candidates.extend([portal.get("email"), portal.get("phone")])
        for candidate in candidates:
            if kind == "phone" and _normalize_phone(candidate) == normalized_value:
                return True
            if kind == "email" and _normalize_text(candidate) == normalized_value:
                return True
        return False

    def _invoice_matches_job_code(self, row: Invoice, normalized_job_code: str) -> bool:
        jobs = self.db.query(Job).filter(Job.invoice_id == row.id).all()
        for job in jobs:
            if _normalize_text(job.job_code) == normalized_job_code:
                return True
        return False

    def _matches_invoice_name(self, row: Invoice, dealership: Dealership | None, normalized_name: str) -> bool:
        candidates = [row.bill_to_name, dealership.name if dealership else None]
        for candidate in candidates:
            normalized_candidate = _normalize_text(candidate)
            if normalized_candidate == normalized_name:
                return True
            if normalized_name and normalized_name in normalized_candidate:
                return True
        return False

    def _matches_invoice_contact(self, row: Invoice, dealership: Dealership | None, normalized_value: str, *, kind: str) -> bool:
        candidates = [row.bill_to_address, row.ship_to_address, dealership.phone if dealership else None, dealership.email if dealership else None]
        for candidate in candidates:
            if kind == "phone" and _normalize_phone(candidate) == normalized_value:
                return True
            if kind == "email" and _normalize_text(candidate) == normalized_value:
                return True
        return False
