from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Iterable, List, Optional
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..core.enums import AuditEntityType
from ..core.security import AuthenticatedUser
from ..models.dealership import Dealership
from ..models.invoice import Invoice, InvoiceLineItem
from ..models.invoice_branding_settings import InvoiceBrandingSettings
from ..models.job import Job
from ..models.job_service import JobService
from ..models.service_catalog import ServiceCatalog
from ..models.technician import Technician
from ..repositories.invoice_repository import InvoiceRepository
from ..schemas.invoice import (
    InvoiceApprovalDraftSaveRequest,
    InvoiceBillingPayload,
    InvoiceCompanyPayload,
    InvoiceCreateRequest,
    InvoicePendingApprovalIssueResponse,
    InvoicePendingApprovalLineItemResponse,
    InvoicePendingApprovalResponse,
    InvoicePendingApprovalServiceResponse,
    InvoiceLineItemPayload,
    InvoicePartyPayload,
    InvoiceResponse,
    InvoiceStatus,
    InvoiceTerms,
    InvoiceUpdateRequest,
)
from .audit_service import AuditService
from .invoice_branding_settings_service import (
    INVOICE_BRANDING_SETTINGS_KEY,
    get_default_invoice_branding_payload,
)
from .job_services_service import JobServicesService


CENTS = Decimal("0.01")
ZERO = Decimal("0")

QUICKBOOKS_TAX_CODE_RATES: dict[str, Decimal] = {
    "EXEMPT": ZERO,
    "ZERO": ZERO,
    "GST": Decimal("0.05"),
    "QST": Decimal("0.09975"),
    "GST_QST": Decimal("0.14975"),
}


def _to_money(value: Decimal | int | float | str) -> Decimal:
    return Decimal(value).quantize(CENTS, rounding=ROUND_HALF_UP)


def _to_tax_rate(value: Decimal | int | float | str) -> Decimal:
    return Decimal(value).quantize(Decimal("0.00001"), rounding=ROUND_HALF_UP)


def compute_line_item_amount(qty: Decimal | int | float | str, rate: Decimal | int | float | str) -> Decimal:
    return _to_money(Decimal(qty) * Decimal(rate))


def compute_subtotal(items: Iterable[InvoiceLineItem]) -> Decimal:
    return _to_money(sum((Decimal(str(item.amount)) for item in items), ZERO))


def compute_tax(items: Iterable[InvoiceLineItem], tax_code_rules: Optional[dict[str, Decimal]] = None) -> Decimal:
    _ = tax_code_rules  # Reserved for explicit external mappings.
    return _to_money(sum((Decimal(str(item.tax_amount)) for item in items), ZERO))


def compute_total(
    subtotal: Decimal | int | float | str,
    tax: Decimal | int | float | str,
    shipping: Decimal | int | float | str,
) -> Decimal:
    return _to_money(Decimal(subtotal) + Decimal(tax) + Decimal(shipping))


class InvoiceService:
    def __init__(self, db: Session, current_user: AuthenticatedUser):
        self.db = db
        self.current_user = current_user
        self.repo = InvoiceRepository(db)

    def save_pending_approval_draft(self, job_id: UUID, payload: InvoiceApprovalDraftSaveRequest) -> InvoicePendingApprovalResponse:
        rows = self.repo.list_pending_approval_jobs()
        target = next((row for row in rows if row[0].id == job_id), None)
        if target is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pending approval job not found")

        job, dealership, technician = target
        tax_rate = self._resolve_tax_rate(
            tax_code=(job.tax_code or "EXEMPT"),
            payload_tax_rate=job.tax_rate,
        )
        bill_to_name = (job.customer_name or (dealership.name if dealership else None) or "").strip()
        bill_to_street = (job.customer_address or (dealership.address if dealership else None) or "").strip()
        bill_to_city = job.customer_city or (dealership.city if dealership else None)
        bill_to_state = job.customer_state or None
        bill_to_zip = job.customer_zip_code or (dealership.postal_code if dealership else None)
        if not bill_to_name or not bill_to_street:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Job is missing bill-to data")

        line_items_payload: list[dict] = []
        services: list[InvoicePendingApprovalServiceResponse] = []
        items: list[InvoicePendingApprovalLineItemResponse] = []
        estimated_subtotal = ZERO
        estimated_sales_tax = ZERO

        for index, line in enumerate(payload.line_items):
            quantity = _to_money(line.quantity if line.quantity is not None else Decimal("1"))
            rate = _to_money(line.rate)
            if quantity <= ZERO or rate <= ZERO:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Draft line quantities and prices must be greater than 0",
                )
            amount = compute_line_item_amount(quantity, rate)
            line_tax_amount = _to_money(amount * tax_rate)
            estimated_subtotal += amount
            estimated_sales_tax += line_tax_amount
            line_id = f"{job.id}:draft:{index}"
            service_name = line.product_service or "Dispatch Service"
            services.append(
                InvoicePendingApprovalServiceResponse(
                    id=line_id,
                    name=service_name,
                    qb_item_id=line.qb_item_id,
                    quantity=quantity,
                    price=rate,
                    total=amount,
                    source="admin_draft",
                    notes=None,
                )
            )
            items.append(
                InvoicePendingApprovalLineItemResponse(
                    id=line_id,
                    description=service_name,
                    quantity=quantity,
                    unit_price=rate,
                    total=amount,
                )
            )
            line_items_payload.append(
                {
                    "product_service": service_name,
                    "qb_item_id": line.qb_item_id,
                    "quantity": str(quantity),
                    "rate": str(rate),
                }
            )

        if not services:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Draft must contain at least 1 line")

        self.repo.upsert_pending_approval_draft(job_id, line_items_payload)
        self.db.commit()

        estimated_subtotal = _to_money(estimated_subtotal)
        estimated_sales_tax = _to_money(estimated_sales_tax)
        estimated_total = compute_total(estimated_subtotal, estimated_sales_tax, ZERO)

        bill_to = (
            InvoicePartyPayload(
                name=bill_to_name or None,
                street=bill_to_street or None,
                city=bill_to_city,
                state=bill_to_state,
                zip_code=bill_to_zip,
            )
            if any([bill_to_name, bill_to_street, bill_to_city, bill_to_state, bill_to_zip])
            else None
        )
        ship_to = (
            InvoicePartyPayload(
                name=job.ship_to_name,
                street=job.ship_to_address,
                city=job.ship_to_city,
                state=job.ship_to_state,
                zip_code=job.ship_to_zip_code,
            )
            if any([job.ship_to_name, job.ship_to_address, job.ship_to_city, job.ship_to_state, job.ship_to_zip_code])
            else None
        )

        return InvoicePendingApprovalResponse(
            job_id=job.id,
            job_code=job.job_code,
            dealership_name=(dealership.name if dealership else bill_to_name) or "Unknown Dealership",
            technician_name=technician.name if technician else None,
            service_summary=", ".join([service.name for service in services]) or (job.service_type or "Dispatch Service"),
            vehicle_summary=job.vehicle or "-",
            completed_at=job.completed_at,
            estimated_subtotal=estimated_subtotal,
            estimated_sales_tax=estimated_sales_tax,
            estimated_total=estimated_total,
            services=services,
            items=items,
            bill_to=bill_to,
            ship_to=ship_to,
        )

    def _require_invoice(self, invoice_id: UUID) -> Invoice:
        row = self.repo.get_by_id(invoice_id)
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
        return row

    def _default_company_payload(self) -> InvoiceCompanyPayload:
        settings_row = (
            self.db.query(InvoiceBrandingSettings)
            .filter(InvoiceBrandingSettings.key == INVOICE_BRANDING_SETTINGS_KEY)
            .first()
        )
        if settings_row is not None:
            return InvoiceCompanyPayload(
                logo_url=settings_row.logo_url,
                name=settings_row.name,
                street_address=settings_row.street_address,
                city=settings_row.city,
                state=settings_row.state,
                zip_code=settings_row.zip_code,
                phone=settings_row.phone,
                email=settings_row.email,
                website=settings_row.website,
            )

        return get_default_invoice_branding_payload()

    def _to_response(self, invoice: Invoice) -> InvoiceResponse:
        first_job_code: Optional[str] = None
        dealership_name: Optional[str] = None
        technician_name: Optional[str] = None

        primary_job = (
            self.db.query(Job)
            .filter(Job.invoice_id == invoice.id)
            .order_by(Job.created_at.asc())
            .first()
        )
        if primary_job is not None:
            first_job_code = primary_job.job_code
            if primary_job.dealership_id is not None:
                dealership = self.db.query(Dealership).filter(Dealership.id == primary_job.dealership_id).first()
                if dealership is not None:
                    dealership_name = dealership.name
            if primary_job.assigned_tech_id is not None:
                technician = self.db.query(Technician).filter(Technician.id == primary_job.assigned_tech_id).first()
                if technician is not None:
                    technician_name = technician.name

        if dealership_name is None:
            dealership_name = invoice.bill_to_name

        line_items = [
            {
                "id": item.id,
                "job_id": item.job_id,
                "product_service": item.product_service,
                "qb_item_id": item.qb_item_id,
                "description": item.description,
                "quantity": item.quantity,
                "qty": item.quantity,
                "rate": item.rate,
                "amount": item.amount,
                "tax_code": item.tax_code,
                "tax_rate": item.tax_rate,
                "tax_amount": item.tax_amount,
                "line_order": item.line_order,
            }
            for item in invoice.line_items
        ]

        bill_to = InvoicePartyPayload(
            name=invoice.bill_to_name,
            street=invoice.bill_to_address,
            city=invoice.bill_to_city,
            state=invoice.bill_to_state,
            zip_code=invoice.bill_to_zip_code,
        )
        ship_to = (
            InvoicePartyPayload(
                name=invoice.ship_to_name,
                street=invoice.ship_to_address,
                city=invoice.ship_to_city,
                state=invoice.ship_to_state,
                zip_code=invoice.ship_to_zip_code,
            )
            if any(
                value
                for value in [
                    invoice.ship_to_name,
                    invoice.ship_to_address,
                    invoice.ship_to_city,
                    invoice.ship_to_state,
                    invoice.ship_to_zip_code,
                ]
            )
            else None
        )

        return InvoiceResponse.model_validate(
            {
                "id": invoice.id,
                "invoice_number": invoice.invoice_number,
                "job_code": first_job_code,
                "dealership_name": dealership_name,
                "technician_name": technician_name,
                "company_info": {
                    "logo_url": invoice.company_logo_url,
                    "name": invoice.company_name,
                    "street_address": invoice.company_street_address,
                    "city": invoice.company_city,
                    "state": invoice.company_state,
                    "zip_code": invoice.company_zip_code,
                    "phone": invoice.company_phone,
                    "email": invoice.company_email,
                    "website": invoice.company_website,
                },
                "company_logo_url": invoice.company_logo_url,
                "company_name": invoice.company_name,
                "company_street_address": invoice.company_street_address,
                "company_city": invoice.company_city,
                "company_state": invoice.company_state,
                "company_zip_code": invoice.company_zip_code,
                "company_phone": invoice.company_phone,
                "company_email": invoice.company_email,
                "company_website": invoice.company_website,
                "bill_to": bill_to.model_dump(),
                "ship_to": ship_to.model_dump() if ship_to else None,
                "bill_to_name": invoice.bill_to_name,
                "bill_to_address": invoice.bill_to_address,
                "bill_to_city": invoice.bill_to_city,
                "bill_to_state": invoice.bill_to_state,
                "bill_to_zip_code": invoice.bill_to_zip_code,
                "ship_to_name": invoice.ship_to_name,
                "ship_to_address": invoice.ship_to_address,
                "ship_to_city": invoice.ship_to_city,
                "ship_to_state": invoice.ship_to_state,
                "ship_to_zip_code": invoice.ship_to_zip_code,
                "invoice_date": invoice.invoice_date,
                "terms": invoice.terms,
                "custom_term_days": invoice.custom_term_days,
                "due_date": invoice.due_date,
                "subtotal": invoice.subtotal,
                "sales_tax_total": invoice.sales_tax,
                "sales_tax": invoice.sales_tax,
                "shipping": invoice.shipping,
                "total": invoice.total,
                "customer_message": invoice.customer_message,
                "approval_note": invoice.approval_note,
                "status": invoice.status,
                "payment_recorded_at": invoice.payment_recorded_at,
                "voided_at": invoice.voided_at,
                "created_at": invoice.created_at,
                "updated_at": invoice.updated_at,
                "line_items": line_items,
            }
        )

    def _resolve_terms_days(self, terms: InvoiceTerms, custom_term_days: Optional[int]) -> int:
        if terms == InvoiceTerms.NET_15:
            return 15
        if terms == InvoiceTerms.NET_30:
            return 30
        if custom_term_days is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="custom_term_days is required when terms is CUSTOM",
            )
        return int(custom_term_days)

    def _resolve_due_date(self, invoice_date: date, terms: InvoiceTerms, custom_term_days: Optional[int]) -> date:
        term_days = self._resolve_terms_days(terms, custom_term_days)
        return invoice_date + timedelta(days=term_days)

    def _resolve_tax_rate(self, *, tax_code: str, payload_tax_rate: Optional[Decimal]) -> Decimal:
        normalized_code = tax_code.strip().upper()
        if normalized_code == "CUSTOM":
            if payload_tax_rate is None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="tax_rate is required for CUSTOM tax code",
                )
            return _to_tax_rate(payload_tax_rate)

        if normalized_code not in QUICKBOOKS_TAX_CODE_RATES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Unsupported tax_code '{tax_code}'. Allowed: {', '.join(sorted([*QUICKBOOKS_TAX_CODE_RATES.keys(), 'CUSTOM']))}",
            )

        return QUICKBOOKS_TAX_CODE_RATES[normalized_code]

    def _build_line_items(
        self,
        line_inputs: Iterable[InvoiceLineItemPayload],
        *,
        start_order: int = 0,
    ) -> tuple[List[InvoiceLineItem], Decimal, Decimal]:
        built: List[InvoiceLineItem] = []
        subtotal = ZERO
        sales_tax = ZERO
        order = start_order

        for item in line_inputs:
            quantity_value = item.quantity if item.quantity is not None else item.qty
            if quantity_value is None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Line item quantity is required",
                )

            quantity = _to_money(quantity_value)
            rate = _to_money(item.rate)
            amount = compute_line_item_amount(quantity, rate)
            tax_rate = self._resolve_tax_rate(tax_code=item.tax_code, payload_tax_rate=item.tax_rate)
            tax_amount = _to_money(amount * tax_rate)

            if amount < ZERO:
                raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Line item amount cannot be negative")
            if tax_amount < ZERO:
                raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Line item tax cannot be negative")

            built.append(
                InvoiceLineItem(
                    job_id=item.job_id,
                    product_service=item.product_service,
                    qb_item_id=item.qb_item_id,
                    description=item.description,
                    quantity=quantity,
                    rate=rate,
                    amount=amount,
                    tax_code=item.tax_code.strip().upper(),
                    tax_rate=tax_rate,
                    tax_amount=tax_amount,
                    line_order=order,
                )
            )
            subtotal += amount
            sales_tax += tax_amount
            order += 1

        return built, compute_subtotal(built), compute_tax(built, QUICKBOOKS_TAX_CODE_RATES)

    def _list_job_service_rows(self, job: Job) -> list[JobService]:
        rows = JobServicesService(self.db).list_service_rows(job)
        if rows:
            return rows

        return [
            JobService(
                job_id=job.id,
                service_name_snapshot=(job.service_type or "Dispatch Service"),
                source="dealership",
                quantity=_to_money(job.hours_worked if job.hours_worked is not None else Decimal("1")),
                unit_price=_to_money(job.rate if job.rate is not None else ZERO),
                sort_order=0,
            )
        ]

    def _resolve_job_dispatch_line_inputs(self, job: Job) -> list[InvoiceLineItemPayload]:
        service_rows = self._list_job_service_rows(job)
        line_items: list[InvoiceLineItemPayload] = []
        for service_row in service_rows:
            quantity = _to_money(service_row.quantity if service_row.quantity is not None else Decimal("1"))
            rate = _to_money(service_row.unit_price if service_row.unit_price is not None else ZERO)
            service_catalog = self._resolve_service_catalog_for_row(service_row)
            if quantity <= ZERO:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Job {job.job_code} has invalid service quantity for invoicing",
                )
            if rate < ZERO:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Job {job.job_code} has invalid service pricing for invoicing",
                )

            description_parts = [part for part in [job.job_code, job.location, job.vehicle] if part]
            if service_row.notes:
                description_parts.append(service_row.notes)

            line_items.append(
                InvoiceLineItemPayload(
                    product_service=service_row.service_name_snapshot or job.service_type or "Dispatch Service",
                    qb_item_id=service_catalog.qb_item_id if service_catalog is not None else None,
                    description=" | ".join(description_parts) or None,
                    quantity=quantity,
                    qty=quantity,
                    rate=rate,
                    tax_code=(job.tax_code or "EXEMPT"),
                    tax_rate=job.tax_rate,
                    job_id=job.id,
                )
            )

        return line_items

    def _collect_pending_approval_blockers(
        self,
        *,
        job: Job,
        dealership: Dealership | None,
    ) -> tuple[list[str], list[InvoiceLineItemPayload]]:
        blockers: list[str] = []

        try:
            self._resolve_tax_rate(
                tax_code=(job.tax_code or "EXEMPT"),
                payload_tax_rate=job.tax_rate,
            )
        except HTTPException:
            blockers.append("Invalid tax configuration")

        bill_to_name = (job.customer_name or (dealership.name if dealership else None) or "").strip()
        bill_to_street = (job.customer_address or (dealership.address if dealership else None) or "").strip()
        if not bill_to_name:
            blockers.append("Missing customer/dealership bill-to name")
        if not bill_to_street:
            blockers.append("Missing customer/dealership bill-to address")

        try:
            dispatch_line_inputs = self._resolve_job_dispatch_line_inputs(job)
        except HTTPException as exc:
            blockers.append(exc.detail if isinstance(exc.detail, str) else "Invalid dispatch service lines")
            dispatch_line_inputs = []

        if not dispatch_line_inputs:
            blockers.append("No billable services found")
        else:
            for line in dispatch_line_inputs:
                quantity = _to_money(line.quantity if line.quantity is not None else Decimal("1"))
                rate = _to_money(line.rate)
                if quantity <= ZERO:
                    blockers.append(f"Service '{line.product_service}' has invalid quantity")
                if rate <= ZERO:
                    blockers.append(f"Service '{line.product_service}' is missing price")

        return list(dict.fromkeys(blockers)), dispatch_line_inputs

    def _build_dispatch_line_items(
        self,
        dispatch_job_ids: list[UUID],
        *,
        current_invoice_id: Optional[UUID] = None,
    ) -> tuple[List[InvoiceLineItemPayload], InvoiceBillingPayload, list[UUID]]:
        if not dispatch_job_ids:
            return [], InvoiceBillingPayload(), []

        jobs = self.repo.get_jobs_by_ids(dispatch_job_ids)
        by_id = {row.id: row for row in jobs}
        missing = [str(job_id) for job_id in dispatch_job_ids if job_id not in by_id]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Dispatch jobs not found: {', '.join(missing)}",
            )

        line_items: list[InvoiceLineItemPayload] = []
        linked_job_ids: list[UUID] = []
        billing_signature: Optional[tuple[str, str, Optional[str], Optional[str], Optional[str]]] = None
        billing_payload: Optional[InvoiceBillingPayload] = None

        for job_id in dispatch_job_ids:
            job = by_id[job_id]
            if str(job.status).strip().upper() != "COMPLETED":
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Job {job.job_code} is not completed and cannot be invoiced",
                )
            if job.invoice_id is not None and job.invoice_id != current_invoice_id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Job {job.job_code} is already linked to another invoice",
                )

            dealership = self.repo.get_dealership_by_id(job.dealership_id) if job.dealership_id else None
            bill_to_name = (job.customer_name or (dealership.name if dealership else None) or "").strip()
            bill_to_address = (job.customer_address or (dealership.address if dealership else None) or "").strip()
            bill_to_city = (job.customer_city or (dealership.city if dealership else None) or None)
            bill_to_state = (job.customer_state or None)
            bill_to_zip_code = (job.customer_zip_code or (dealership.postal_code if dealership else None) or None)

            if not bill_to_name or not bill_to_address:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Job {job.job_code} is missing customer billing data",
                )

            signature = (bill_to_name, bill_to_address, bill_to_city, bill_to_state, bill_to_zip_code)
            if billing_signature is None:
                billing_signature = signature
                billing_payload = InvoiceBillingPayload(
                    bill_to_name=bill_to_name,
                    bill_to_address=bill_to_address,
                    bill_to_city=bill_to_city,
                    bill_to_state=bill_to_state,
                    bill_to_zip_code=bill_to_zip_code,
                    ship_to_name=job.ship_to_name,
                    ship_to_address=job.ship_to_address,
                    ship_to_city=job.ship_to_city,
                    ship_to_state=job.ship_to_state,
                    ship_to_zip_code=job.ship_to_zip_code,
                )
            elif signature != billing_signature:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="All merged dispatch jobs must belong to the same bill-to customer",
                )

            resolved_lines = self._resolve_job_dispatch_line_inputs(job)
            for line in resolved_lines:
                quantity = _to_money(line.quantity if line.quantity is not None else Decimal("1"))
                rate = _to_money(line.rate)
                if quantity <= ZERO:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=f"Job {job.job_code} has invalid service quantity for invoicing",
                    )
                if rate <= ZERO:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=f"Job {job.job_code} has missing service pricing for invoicing",
                    )
            line_items.extend(resolved_lines)
            linked_job_ids.append(job.id)

        return line_items, billing_payload or InvoiceBillingPayload(), linked_job_ids

    def _resolve_company_payload(
        self,
        provided_company: Optional[InvoiceCompanyPayload],
        provided_company_info: Optional[InvoiceCompanyPayload],
    ) -> InvoiceCompanyPayload:
        if provided_company_info is not None:
            return provided_company_info
        if provided_company is not None:
            return provided_company
        return self._default_company_payload()

    def _payload_to_billing(
        self,
        billing: Optional[InvoiceBillingPayload],
        bill_to: Optional[InvoicePartyPayload],
        ship_to: Optional[InvoicePartyPayload],
    ) -> Optional[InvoiceBillingPayload]:
        if billing is None and bill_to is None and ship_to is None:
            return None
        return InvoiceBillingPayload(
            bill_to_name=(bill_to.name if bill_to else None) or (billing.bill_to_name if billing else None),
            bill_to_address=(bill_to.street if bill_to else None) or (billing.bill_to_address if billing else None),
            bill_to_city=(bill_to.city if bill_to else None) or (billing.bill_to_city if billing else None),
            bill_to_state=(bill_to.state if bill_to else None) or (billing.bill_to_state if billing else None),
            bill_to_zip_code=(bill_to.zip_code if bill_to else None) or (billing.bill_to_zip_code if billing else None),
            ship_to_name=(ship_to.name if ship_to else None) or (billing.ship_to_name if billing else None),
            ship_to_address=(ship_to.street if ship_to else None) or (billing.ship_to_address if billing else None),
            ship_to_city=(ship_to.city if ship_to else None) or (billing.ship_to_city if billing else None),
            ship_to_state=(ship_to.state if ship_to else None) or (billing.ship_to_state if billing else None),
            ship_to_zip_code=(ship_to.zip_code if ship_to else None) or (billing.ship_to_zip_code if billing else None),
        )

    def _resolve_billing_payload(
        self,
        provided: Optional[InvoiceBillingPayload],
        from_jobs: InvoiceBillingPayload,
    ) -> InvoiceBillingPayload:
        merged = InvoiceBillingPayload(
            bill_to_name=(provided.bill_to_name if provided else None) or from_jobs.bill_to_name,
            bill_to_address=(provided.bill_to_address if provided else None) or from_jobs.bill_to_address,
            bill_to_city=(provided.bill_to_city if provided else None) or from_jobs.bill_to_city,
            bill_to_state=(provided.bill_to_state if provided else None) or from_jobs.bill_to_state,
            bill_to_zip_code=(provided.bill_to_zip_code if provided else None) or from_jobs.bill_to_zip_code,
            ship_to_name=(provided.ship_to_name if provided else None) or from_jobs.ship_to_name,
            ship_to_address=(provided.ship_to_address if provided else None) or from_jobs.ship_to_address,
            ship_to_city=(provided.ship_to_city if provided else None) or from_jobs.ship_to_city,
            ship_to_state=(provided.ship_to_state if provided else None) or from_jobs.ship_to_state,
            ship_to_zip_code=(provided.ship_to_zip_code if provided else None) or from_jobs.ship_to_zip_code,
        )
        if not merged.bill_to_name or not merged.bill_to_address:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Cannot create invoice without customer bill-to name and address",
            )
        return merged

    def _normalize_invoice_number(self, invoice_number: Optional[str]) -> Optional[str]:
        if invoice_number is None:
            return None
        normalized = invoice_number.strip().upper()
        return normalized or None

    def _resolve_status(
        self,
        *,
        requested_status: InvoiceStatus,
        due_date: date,
        payment_recorded_at: Optional[datetime],
    ) -> InvoiceStatus:
        if requested_status == InvoiceStatus.PAID and payment_recorded_at is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Invoice cannot be marked paid without payment_recorded_at",
            )
        if requested_status in {InvoiceStatus.DRAFT, InvoiceStatus.SENT} and date.today() > due_date:
            return InvoiceStatus.OVERDUE
        return requested_status

    def _update_overdue_status_if_needed(self, invoice: Invoice) -> None:
        if invoice.status in {InvoiceStatus.DRAFT.value, InvoiceStatus.SENT.value} and date.today() > invoice.due_date:
            invoice.status = InvoiceStatus.OVERDUE.value

    def _create_with_unique_invoice_number(self, invoice: Invoice, explicit_number: Optional[str]) -> Invoice:
        if explicit_number:
            existing = self.repo.get_by_number(explicit_number)
            if existing is not None:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Invoice number already exists")
            invoice.invoice_number = explicit_number
            try:
                return self.repo.create(invoice)
            except IntegrityError as exc:
                self.db.rollback()
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Invoice number already exists") from exc

        for _ in range(5):
            invoice.invoice_number = self.repo.generate_next_invoice_number()
            try:
                return self.repo.create(invoice)
            except IntegrityError:
                self.db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate unique invoice number",
        )

    def _replace_line_items(
        self,
        invoice: Invoice,
        *,
        dispatch_line_inputs: List[InvoiceLineItemPayload],
        manual_line_inputs: List[InvoiceLineItemPayload],
    ) -> tuple[Decimal, Decimal]:
        invoice.line_items.clear()
        built_dispatch, dispatch_subtotal, dispatch_sales_tax = self._build_line_items(dispatch_line_inputs, start_order=0)
        built_manual, manual_subtotal, manual_sales_tax = self._build_line_items(
            manual_line_inputs,
            start_order=len(built_dispatch),
        )
        for item in [*built_dispatch, *built_manual]:
            invoice.line_items.append(item)

        subtotal = _to_money(dispatch_subtotal + manual_subtotal)
        sales_tax = _to_money(dispatch_sales_tax + manual_sales_tax)
        return subtotal, sales_tax

    def list_invoices(self) -> list[InvoiceResponse]:
        rows = self.repo.list()
        dirty = False
        for row in rows:
            original = row.status
            self._update_overdue_status_if_needed(row)
            if row.status != original:
                dirty = True
        if dirty:
            self.db.commit()
        return [self._to_response(row) for row in rows]

    def list_pending_approvals(self) -> list[InvoicePendingApprovalResponse]:
        rows = self.repo.list_pending_approval_jobs()
        draft_rows = self.repo.list_pending_approval_drafts([job.id for job, _, _ in rows])
        drafts_by_job_id = {row.job_id: row for row in draft_rows}
        payload: list[InvoicePendingApprovalResponse] = []

        for job, dealership, technician in rows:
            try:
                tax_rate = self._resolve_tax_rate(
                    tax_code=(job.tax_code or "EXEMPT"),
                    payload_tax_rate=job.tax_rate,
                )
            except HTTPException:
                # Exclude jobs with invalid tax configuration from approval queue.
                continue

            bill_to_name = (job.customer_name or (dealership.name if dealership else None) or "").strip()
            bill_to_street = (job.customer_address or (dealership.address if dealership else None) or "").strip()
            bill_to_city = job.customer_city or (dealership.city if dealership else None)
            bill_to_state = job.customer_state or None
            bill_to_zip = job.customer_zip_code or (dealership.postal_code if dealership else None)
            if not bill_to_name or not bill_to_street:
                continue

            draft = drafts_by_job_id.get(job.id)
            if draft is not None and isinstance(draft.line_items, list) and len(draft.line_items) > 0:
                dispatch_line_inputs: list[InvoiceLineItemPayload] = []
                for line in draft.line_items:
                    if not isinstance(line, dict):
                        continue
                    try:
                        dispatch_line_inputs.append(
                            InvoiceLineItemPayload(
                                product_service=str(line.get("product_service") or "Dispatch Service"),
                                qb_item_id=(str(line.get("qb_item_id")) if line.get("qb_item_id") else None),
                                quantity=Decimal(str(line.get("quantity") or "0")),
                                qty=Decimal(str(line.get("quantity") or "0")),
                                rate=Decimal(str(line.get("rate") or "0")),
                                tax_code=(job.tax_code or "EXEMPT"),
                                tax_rate=job.tax_rate,
                                job_id=job.id,
                            )
                        )
                    except Exception:
                        continue
            else:
                try:
                    dispatch_line_inputs = self._resolve_job_dispatch_line_inputs(job)
                except HTTPException:
                    continue

            if not dispatch_line_inputs:
                continue

            services: list[InvoicePendingApprovalServiceResponse] = []
            items: list[InvoicePendingApprovalLineItemResponse] = []
            estimated_subtotal = ZERO
            estimated_sales_tax = ZERO
            service_rows = self._list_job_service_rows(job)

            for index, line in enumerate(dispatch_line_inputs):
                quantity = _to_money(line.quantity if line.quantity is not None else Decimal("1"))
                rate = _to_money(line.rate)
                if quantity <= ZERO or rate <= ZERO:
                    services = []
                    items = []
                    break
                amount = compute_line_item_amount(quantity, rate)
                line_tax_amount = _to_money(amount * tax_rate)
                estimated_subtotal += amount
                estimated_sales_tax += line_tax_amount

                service_row = service_rows[index] if draft is None and index < len(service_rows) else None
                service_catalog = self._resolve_service_catalog_for_row(service_row) if service_row is not None else None
                service_id = (
                    str(service_row.id)
                    if service_row is not None and service_row.id is not None
                    else f"{job.id}:{'draft:' if draft is not None else ''}{index}"
                )
                service_name = line.product_service or "Dispatch Service"

                services.append(
                    InvoicePendingApprovalServiceResponse(
                        id=service_id,
                        name=service_name,
                        qb_item_id=service_catalog.qb_item_id if service_catalog is not None else None,
                        quantity=quantity,
                        price=rate,
                        total=amount,
                        source=("admin_draft" if draft is not None else (service_row.source if service_row is not None else None)),
                        notes=None if draft is not None else (service_row.notes if service_row is not None else None),
                    )
                )
                items.append(
                    InvoicePendingApprovalLineItemResponse(
                        id=service_id,
                        description=service_name,
                        quantity=quantity,
                        unit_price=rate,
                        total=amount,
                    )
                )

            if not services or not items:
                continue

            estimated_subtotal = _to_money(estimated_subtotal)
            estimated_sales_tax = _to_money(estimated_sales_tax)
            estimated_total = compute_total(estimated_subtotal, estimated_sales_tax, ZERO)

            bill_to = (
                InvoicePartyPayload(
                    name=bill_to_name or None,
                    street=bill_to_street or None,
                    city=bill_to_city,
                    state=bill_to_state,
                    zip_code=bill_to_zip,
                )
                if any([bill_to_name, bill_to_street, bill_to_city, bill_to_state, bill_to_zip])
                else None
            )
            ship_to = (
                InvoicePartyPayload(
                    name=job.ship_to_name,
                    street=job.ship_to_address,
                    city=job.ship_to_city,
                    state=job.ship_to_state,
                    zip_code=job.ship_to_zip_code,
                )
                if any([job.ship_to_name, job.ship_to_address, job.ship_to_city, job.ship_to_state, job.ship_to_zip_code])
                else None
            )

            payload.append(
                InvoicePendingApprovalResponse(
                    job_id=job.id,
                    job_code=job.job_code,
                    dealership_name=(dealership.name if dealership else bill_to_name) or "Unknown Dealership",
                    technician_name=technician.name if technician else None,
                    service_summary=", ".join([service.name for service in services]) or (job.service_type or "Dispatch Service"),
                    vehicle_summary=job.vehicle or "-",
                    completed_at=job.completed_at,
                    estimated_subtotal=estimated_subtotal,
                    estimated_sales_tax=estimated_sales_tax,
                    estimated_total=estimated_total,
                    services=services,
                    items=items,
                    bill_to=bill_to,
                    ship_to=ship_to,
                )
            )

        return payload

    def _resolve_service_catalog_for_row(self, service_row: JobService) -> ServiceCatalog | None:
        if service_row.service_catalog_id is not None:
            row = (
                self.db.query(ServiceCatalog)
                .filter(ServiceCatalog.id == service_row.service_catalog_id)
                .first()
            )
            if row is not None:
                return row

        if not service_row.service_name_snapshot:
            return None

        return (
            self.db.query(ServiceCatalog)
            .filter(ServiceCatalog.name.ilike(service_row.service_name_snapshot.strip()))
            .first()
        )

    def list_pending_approval_issues(self) -> list[InvoicePendingApprovalIssueResponse]:
        rows = self.repo.list_pending_approval_jobs()
        payload: list[InvoicePendingApprovalIssueResponse] = []

        for job, dealership, technician in rows:
            blockers, _ = self._collect_pending_approval_blockers(job=job, dealership=dealership)
            if not blockers:
                continue

            payload.append(
                InvoicePendingApprovalIssueResponse(
                    job_id=job.id,
                    job_code=job.job_code,
                    dealership_name=(dealership.name if dealership else (job.customer_name or "").strip()) or "Unknown Dealership",
                    technician_name=technician.name if technician else None,
                    service_summary=job.service_type or "Dispatch Service",
                    vehicle_summary=job.vehicle or "-",
                    completed_at=job.completed_at,
                    blocking_reasons=blockers,
                )
            )

        return payload

    def get_invoice(self, invoice_id: UUID) -> InvoiceResponse:
        row = self._require_invoice(invoice_id)
        original = row.status
        self._update_overdue_status_if_needed(row)
        if row.status != original:
            self.db.commit()
            self.db.refresh(row)
        return self._to_response(row)

    def create_invoice(self, payload: InvoiceCreateRequest) -> InvoiceResponse:
        dispatch_lines, dispatch_billing, dispatch_job_ids = self._build_dispatch_line_items(payload.dispatch_job_ids)
        company = self._resolve_company_payload(payload.company, payload.company_info)
        requested_billing = self._payload_to_billing(payload.billing, payload.bill_to, payload.ship_to)
        billing = self._resolve_billing_payload(requested_billing, dispatch_billing)
        invoice_date = payload.invoice_date or date.today()
        due_date = self._resolve_due_date(invoice_date, payload.terms, payload.custom_term_days)
        resolved_status = self._resolve_status(
            requested_status=payload.status,
            due_date=due_date,
            payment_recorded_at=payload.payment_recorded_at,
        )

        invoice = Invoice(
            company_logo_url=company.logo_url,
            company_name=company.name,
            company_street_address=company.street_address,
            company_city=company.city,
            company_state=company.state,
            company_zip_code=company.zip_code,
            company_phone=company.phone,
            company_email=company.email,
            company_website=company.website,
            bill_to_name=billing.bill_to_name,
            bill_to_address=billing.bill_to_address,
            bill_to_city=billing.bill_to_city,
            bill_to_state=billing.bill_to_state,
            bill_to_zip_code=billing.bill_to_zip_code,
            ship_to_name=billing.ship_to_name,
            ship_to_address=billing.ship_to_address,
            ship_to_city=billing.ship_to_city,
            ship_to_state=billing.ship_to_state,
            ship_to_zip_code=billing.ship_to_zip_code,
            invoice_date=invoice_date,
            terms=payload.terms.value,
            custom_term_days=payload.custom_term_days,
            due_date=due_date,
            customer_message=payload.customer_message,
            approval_note=payload.approval_note,
            status=resolved_status.value,
            payment_recorded_at=payload.payment_recorded_at,
        )

        use_dispatch_lines = not (payload.replace_dispatch_line_items and payload.line_items)
        subtotal, sales_tax = self._replace_line_items(
            invoice,
            dispatch_line_inputs=dispatch_lines if use_dispatch_lines else [],
            manual_line_inputs=payload.line_items,
        )
        if len(invoice.line_items) == 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Cannot create invoice without at least 1 line item",
            )

        shipping = _to_money(payload.shipping)
        total = compute_total(subtotal, sales_tax, shipping)
        if total < ZERO:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invoice total cannot be negative")

        invoice.subtotal = subtotal
        invoice.sales_tax = sales_tax
        invoice.shipping = shipping
        invoice.total = total

        explicit_invoice_number = self._normalize_invoice_number(payload.invoice_number)
        created = self._create_with_unique_invoice_number(invoice, explicit_invoice_number)
        if dispatch_job_ids:
            self.repo.set_jobs_invoice(dispatch_job_ids, created.id)
            for job_id in dispatch_job_ids:
                self.repo.delete_pending_approval_draft(job_id)

        AuditService.log_event(
            self.db,
            actor_role=self.current_user.role,
            actor_id=self.current_user.user_id,
            action="invoice.created",
            entity_type=AuditEntityType.INVOICE.value,
            entity_id=created.id,
            metadata={
                "invoice_number": created.invoice_number,
                "subtotal": str(created.subtotal),
                "sales_tax": str(created.sales_tax),
                "shipping": str(created.shipping),
                "total": str(created.total),
                "dispatch_job_ids": [str(job_id) for job_id in dispatch_job_ids],
                "approval_note": created.approval_note,
            },
        )
        self.db.commit()
        self.db.refresh(created)
        return self._to_response(created)

    def update_invoice(self, invoice_id: UUID, payload: InvoiceUpdateRequest) -> InvoiceResponse:
        invoice = self._require_invoice(invoice_id)
        if invoice.status == InvoiceStatus.CANCELLED.value:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Cancelled invoices cannot be updated",
            )

        terms = InvoiceTerms(payload.terms or invoice.terms)
        custom_term_days = payload.custom_term_days if payload.custom_term_days is not None else invoice.custom_term_days
        if terms == InvoiceTerms.CUSTOM and custom_term_days is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="custom_term_days is required when terms is CUSTOM",
            )
        if terms != InvoiceTerms.CUSTOM:
            custom_term_days = None

        invoice_date = payload.invoice_date or invoice.invoice_date
        due_date = self._resolve_due_date(invoice_date, terms, custom_term_days)
        payment_recorded_at = payload.payment_recorded_at if payload.payment_recorded_at is not None else invoice.payment_recorded_at
        requested_status = payload.status or InvoiceStatus(invoice.status)
        resolved_status = self._resolve_status(
            requested_status=requested_status,
            due_date=due_date,
            payment_recorded_at=payment_recorded_at,
        )

        dispatch_lines: list[InvoiceLineItemPayload] = []
        dispatch_billing = InvoiceBillingPayload()
        dispatch_job_ids: list[UUID] = []
        replacing_lines = payload.dispatch_job_ids is not None or payload.line_items is not None
        if replacing_lines:
            dispatch_lines, dispatch_billing, dispatch_job_ids = self._build_dispatch_line_items(
                payload.dispatch_job_ids or [],
                current_invoice_id=invoice.id,
            )

        if payload.company is not None:
            company = payload.company
        elif payload.company_info is not None:
            company = payload.company_info
        else:
            company = InvoiceCompanyPayload(
                logo_url=invoice.company_logo_url,
                name=invoice.company_name,
                street_address=invoice.company_street_address,
                city=invoice.company_city,
                state=invoice.company_state,
                zip_code=invoice.company_zip_code,
                phone=invoice.company_phone,
                email=invoice.company_email,
                website=invoice.company_website,
            )

        requested_billing = self._payload_to_billing(payload.billing, payload.bill_to, payload.ship_to)
        if requested_billing is not None or payload.dispatch_job_ids is not None:
            billing = self._resolve_billing_payload(
                requested_billing,
                dispatch_billing,
            )
        else:
            billing = InvoiceBillingPayload(
                bill_to_name=invoice.bill_to_name,
                bill_to_address=invoice.bill_to_address,
                bill_to_city=invoice.bill_to_city,
                bill_to_state=invoice.bill_to_state,
                bill_to_zip_code=invoice.bill_to_zip_code,
                ship_to_name=invoice.ship_to_name,
                ship_to_address=invoice.ship_to_address,
                ship_to_city=invoice.ship_to_city,
                ship_to_state=invoice.ship_to_state,
                ship_to_zip_code=invoice.ship_to_zip_code,
            )

        invoice.company_logo_url = company.logo_url
        invoice.company_name = company.name
        invoice.company_street_address = company.street_address
        invoice.company_city = company.city
        invoice.company_state = company.state
        invoice.company_zip_code = company.zip_code
        invoice.company_phone = company.phone
        invoice.company_email = company.email
        invoice.company_website = company.website

        invoice.bill_to_name = billing.bill_to_name
        invoice.bill_to_address = billing.bill_to_address
        invoice.bill_to_city = billing.bill_to_city
        invoice.bill_to_state = billing.bill_to_state
        invoice.bill_to_zip_code = billing.bill_to_zip_code
        invoice.ship_to_name = billing.ship_to_name
        invoice.ship_to_address = billing.ship_to_address
        invoice.ship_to_city = billing.ship_to_city
        invoice.ship_to_state = billing.ship_to_state
        invoice.ship_to_zip_code = billing.ship_to_zip_code

        invoice.invoice_date = invoice_date
        invoice.terms = terms.value
        invoice.custom_term_days = custom_term_days
        invoice.due_date = due_date
        if payload.customer_message is not None:
            invoice.customer_message = payload.customer_message
        if payload.approval_note is not None:
            invoice.approval_note = payload.approval_note

        normalized_invoice_number = self._normalize_invoice_number(payload.invoice_number)
        if normalized_invoice_number and normalized_invoice_number != invoice.invoice_number:
            existing = self.repo.get_by_number(normalized_invoice_number)
            if existing is not None and existing.id != invoice.id:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Invoice number already exists")
            invoice.invoice_number = normalized_invoice_number

        if replacing_lines:
            self.repo.clear_jobs_for_invoice(invoice.id)
            use_dispatch_lines = not (bool(payload.replace_dispatch_line_items) and bool(payload.line_items))
            subtotal, sales_tax = self._replace_line_items(
                invoice,
                dispatch_line_inputs=dispatch_lines if use_dispatch_lines else [],
                manual_line_inputs=payload.line_items or [],
            )
            if len(invoice.line_items) == 0:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Cannot update invoice to 0 line items",
                )
            if dispatch_job_ids:
                self.repo.set_jobs_invoice(dispatch_job_ids, invoice.id)
                for job_id in dispatch_job_ids:
                    self.repo.delete_pending_approval_draft(job_id)
        else:
            subtotal = _to_money(sum((Decimal(str(item.amount)) for item in invoice.line_items), ZERO))
            sales_tax = _to_money(sum((Decimal(str(item.tax_amount)) for item in invoice.line_items), ZERO))

        shipping = _to_money(payload.shipping if payload.shipping is not None else invoice.shipping)
        total = compute_total(subtotal, sales_tax, shipping)
        if total < ZERO:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invoice total cannot be negative")

        invoice.subtotal = subtotal
        invoice.sales_tax = sales_tax
        invoice.shipping = shipping
        invoice.total = total
        invoice.status = resolved_status.value
        invoice.payment_recorded_at = payment_recorded_at

        try:
            self.repo.update(invoice)
        except IntegrityError as exc:
            self.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Invoice number already exists") from exc

        AuditService.log_event(
            self.db,
            actor_role=self.current_user.role,
            actor_id=self.current_user.user_id,
            action="invoice.updated",
            entity_type=AuditEntityType.INVOICE.value,
            entity_id=invoice.id,
            metadata={
                "invoice_number": invoice.invoice_number,
                "subtotal": str(invoice.subtotal),
                "sales_tax": str(invoice.sales_tax),
                "shipping": str(invoice.shipping),
                "total": str(invoice.total),
                "approval_note": invoice.approval_note,
            },
        )
        self.db.commit()
        self.db.refresh(invoice)
        return self._to_response(invoice)

    def mark_invoice_paid(self, invoice_id: UUID, payment_recorded_at: Optional[datetime] = None) -> InvoiceResponse:
        invoice = self._require_invoice(invoice_id)
        if invoice.status == InvoiceStatus.CANCELLED.value:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Cancelled invoices cannot be marked paid",
            )

        payment_at = payment_recorded_at or datetime.now(timezone.utc)
        invoice.payment_recorded_at = payment_at
        invoice.status = InvoiceStatus.PAID.value
        self.repo.update(invoice)

        AuditService.log_event(
            self.db,
            actor_role=self.current_user.role,
            actor_id=self.current_user.user_id,
            action="invoice.paid",
            entity_type=AuditEntityType.INVOICE.value,
            entity_id=invoice.id,
            metadata={"invoice_number": invoice.invoice_number, "payment_recorded_at": payment_at.isoformat()},
        )
        self.db.commit()
        self.db.refresh(invoice)
        return self._to_response(invoice)

    def void_invoice(self, invoice_id: UUID) -> InvoiceResponse:
        invoice = self._require_invoice(invoice_id)
        if invoice.status == InvoiceStatus.CANCELLED.value:
            return self._to_response(invoice)

        invoice.status = InvoiceStatus.CANCELLED.value
        invoice.voided_at = datetime.now(timezone.utc)
        self.repo.clear_jobs_for_invoice(invoice.id)
        self.repo.update(invoice)

        AuditService.log_event(
            self.db,
            actor_role=self.current_user.role,
            actor_id=self.current_user.user_id,
            action="invoice.voided",
            entity_type=AuditEntityType.INVOICE.value,
            entity_id=invoice.id,
            metadata={"invoice_number": invoice.invoice_number},
        )
        self.db.commit()
        self.db.refresh(invoice)
        return self._to_response(invoice)
