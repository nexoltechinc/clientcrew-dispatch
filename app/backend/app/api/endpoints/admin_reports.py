from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ...api import deps
from ...core.enums import UserRole
from ...core.security import AuthenticatedUser
from ...schemas.reporting import ReportsOverviewResponse
from ...services.reports_service import ReportsService

router = APIRouter(prefix="/admin/reports", tags=["admin-reports"])


@router.get("/overview", response_model=ReportsOverviewResponse)
def get_reports_overview(
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    db: Session = Depends(deps.get_db),
    current_user: AuthenticatedUser = Depends(deps.require_roles(UserRole.ADMIN)),
):
    _ = current_user
    resolved_to = to_date or date.today()
    resolved_from = from_date or (resolved_to - timedelta(days=7))
    if resolved_from > resolved_to:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="from_date cannot be later than to_date",
        )

    return ReportsService(db).get_overview(from_date=resolved_from, to_date=resolved_to)
