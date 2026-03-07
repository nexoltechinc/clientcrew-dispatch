from fastapi import APIRouter

from .endpoints import (
    admin_dealerships,
    admin_email_change_requests,
    admin_jobs,
    admin_reports,
    admin_services,
    admin_settings,
    admin_technicians,
    auth,
    integrations_make_jobs,
    invoices,
    signup_requests,
    technician_profile,
    technician_time_off,
)

router = APIRouter(prefix="/api/v1", tags=["api-v1"])

# Admin resources
router.include_router(admin_technicians.router)
router.include_router(admin_jobs.router)
router.include_router(admin_dealerships.router)
router.include_router(admin_email_change_requests.router)
router.include_router(admin_reports.router)
router.include_router(admin_services.router)
router.include_router(admin_services.catalog_router)
router.include_router(admin_settings.router)

# Technician resources
router.include_router(technician_profile.router)
router.include_router(technician_time_off.router)

# Auth and workflows
router.include_router(auth.router)
router.include_router(invoices.router)
router.include_router(integrations_make_jobs.router)
router.include_router(signup_requests.public_router)
router.include_router(signup_requests.admin_router)


@router.get("/health", tags=["health"])
def healthcheck() -> dict[str, str]:
    return {"status": "ok", "version": "v1"}
