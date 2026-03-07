from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID

from ...api import deps
from ...core.enums import UserRole
from ...core.security import AuthenticatedUser
from ...schemas.settings import (
    AdminCredentialSettingsResponse,
    AdminCredentialSettingsUpdatePayload,
    AdminPasswordChangePayload,
    AdminPasswordChangeResponse,
    InvoiceBrandingSettingsPayload,
    InvoiceBrandingSettingsResponse,
    PriorityRuleCreatePayload,
    PriorityRuleResponse,
    PriorityRuleUpdatePayload,
)
from ...services.admin_credential_settings_service import AdminCredentialSettingsService
from ...services.invoice_branding_settings_service import InvoiceBrandingSettingsService
from ...services.priority_rules_service import PriorityRulesService

router = APIRouter(prefix="/admin/settings", tags=["admin-settings"])


@router.get("/admin-credentials", response_model=AdminCredentialSettingsResponse)
def get_admin_credentials_settings(
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    _ = current_user
    return AdminCredentialSettingsService(db).get_settings()


@router.get("/invoice-branding", response_model=InvoiceBrandingSettingsResponse)
def get_invoice_branding_settings(
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    _ = current_user
    return InvoiceBrandingSettingsService(db).get_invoice_branding()


@router.put("/invoice-branding", response_model=InvoiceBrandingSettingsResponse)
def update_invoice_branding_settings(
    payload: InvoiceBrandingSettingsPayload,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    _ = current_user
    return InvoiceBrandingSettingsService(db).upsert_invoice_branding(payload)


@router.post("/admin-password", response_model=AdminPasswordChangeResponse)
def change_admin_password(
    payload: AdminPasswordChangePayload,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    _ = current_user
    return AdminCredentialSettingsService(db).change_password(
        current_password=payload.current_password,
        new_password=payload.new_password,
    )


@router.put("/admin-credentials", response_model=AdminCredentialSettingsResponse)
def update_admin_credentials_settings(
    payload: AdminCredentialSettingsUpdatePayload,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    _ = current_user
    return AdminCredentialSettingsService(db).update_credentials(
        current_password=payload.current_password,
        admin_email=payload.admin_email,
        recovery_email=payload.recovery_email,
        new_password=payload.new_password,
    )


@router.get("/priority-rules", response_model=List[PriorityRuleResponse])
def list_priority_rules(
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    return PriorityRulesService(db, current_user).list_rules()


@router.post("/priority-rules", response_model=PriorityRuleResponse, status_code=201)
def create_priority_rule(
    payload: PriorityRuleCreatePayload,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    return PriorityRulesService(db, current_user).create_rule(payload)


@router.patch("/priority-rules/{rule_id}", response_model=PriorityRuleResponse)
def update_priority_rule(
    rule_id: UUID,
    payload: PriorityRuleUpdatePayload,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    return PriorityRulesService(db, current_user).update_rule(rule_id, payload)


@router.delete("/priority-rules/{rule_id}")
def delete_priority_rule(
    rule_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    _ = current_user
    return PriorityRulesService(db, current_user).delete_rule(rule_id)

