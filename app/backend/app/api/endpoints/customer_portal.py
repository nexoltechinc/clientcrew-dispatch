from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ...api import deps
from ...schemas.customer_portal import (
    CustomerBrandingResponse,
    CustomerInvoiceLookupResponse,
    CustomerJobLookupResponse,
    CustomerServiceCatalogItemResponse,
    CustomerServiceRequestCreateRequest,
    CustomerServiceRequestResponse,
)
from ...services.customer_portal_service import CustomerPortalService


router = APIRouter(prefix="/customer", tags=["customer-portal"])


@router.get("/branding", response_model=CustomerBrandingResponse)
def get_customer_branding(db: Session = Depends(deps.get_db)):
    return CustomerPortalService(db).get_branding()


@router.get("/services", response_model=list[CustomerServiceCatalogItemResponse])
def list_customer_services(db: Session = Depends(deps.get_db)):
    return CustomerPortalService(db).list_services()


@router.post("/service-requests", response_model=CustomerServiceRequestResponse, status_code=201)
def create_customer_service_request(
    payload: CustomerServiceRequestCreateRequest,
    db: Session = Depends(deps.get_db),
):
    return CustomerPortalService(db).submit_request(payload)


@router.get("/jobs/lookup", response_model=CustomerJobLookupResponse)
def lookup_customer_job(
    job_code: Optional[str] = Query(default=None, max_length=50),
    customer_name: Optional[str] = Query(default=None, max_length=255),
    contact_email: Optional[str] = Query(default=None, max_length=255),
    contact_phone: Optional[str] = Query(default=None, max_length=64),
    db: Session = Depends(deps.get_db),
):
    return CustomerPortalService(db).lookup_jobs(
        job_code=job_code,
        customer_name=customer_name,
        contact_email=contact_email,
        contact_phone=contact_phone,
    )


@router.get("/invoices/lookup", response_model=CustomerInvoiceLookupResponse)
def lookup_customer_invoice(
    invoice_number: Optional[str] = Query(default=None, max_length=64),
    job_code: Optional[str] = Query(default=None, max_length=50),
    customer_name: Optional[str] = Query(default=None, max_length=255),
    contact_email: Optional[str] = Query(default=None, max_length=255),
    contact_phone: Optional[str] = Query(default=None, max_length=64),
    db: Session = Depends(deps.get_db),
):
    return CustomerPortalService(db).lookup_invoices(
        invoice_number=invoice_number,
        job_code=job_code,
        customer_name=customer_name,
        contact_email=contact_email,
        contact_phone=contact_phone,
    )
