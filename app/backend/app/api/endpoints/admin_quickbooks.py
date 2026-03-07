from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ...api import deps
from ...core.enums import UserRole
from ...core.security import AuthenticatedUser
from ...schemas.admin_services import AdminQuickBooksSyncResponse
from ...services.quickbooks_item_sync_service import QuickBooksItemSyncService

router = APIRouter(prefix="/admin/quickbooks", tags=["admin-quickbooks"])


@router.post("/sync-items", response_model=AdminQuickBooksSyncResponse)
def sync_quickbooks_items(
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    _ = current_user
    result = QuickBooksItemSyncService(db).sync_items()
    return AdminQuickBooksSyncResponse(
        synced_count=result.synced_count,
        created_count=result.created_count,
        updated_count=result.updated_count,
        archived_count=result.archived_count,
    )
