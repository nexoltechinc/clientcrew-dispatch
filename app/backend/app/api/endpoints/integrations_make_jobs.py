from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ...api import deps
from ...schemas.job_intake import (
    MakeJobIntakeItem,
    MakeJobIntakeResponse,
    MakeJobIntakeResultItem,
)
from ...services.job_workflow_service import JobWorkflowService

router = APIRouter(prefix="/integrations/make/jobs", tags=["integrations-make-jobs"])


@router.post("", response_model=MakeJobIntakeResponse, status_code=201)
def ingest_jobs_from_make(
    payload: List[MakeJobIntakeItem],
    db: Session = Depends(deps.get_db),
):
    """
    Ingest jobs pushed by Make.com (SMS/email/webhook automation).

    Business rule enforced here:
    - Newly created jobs always start as `admin_review`.
    - Automation may update details for retries/replays, but it cannot schedule jobs.
    """
    results = JobWorkflowService(db).upsert_jobs_from_make(payload)
    response_items = [
        MakeJobIntakeResultItem(
            id=result.row.id,
            job_code=result.row.job_code,
            status=result.row.status,
            action=result.action,
            dealership_id=result.row.dealership_id,
            requested_service_date=result.row.requested_service_date,
            requested_service_time=result.row.requested_service_time,
        )
        for result in results
    ]
    created = sum(1 for item in response_items if item.action == "created")
    updated = len(response_items) - created
    return MakeJobIntakeResponse(
        total=len(response_items),
        created=created,
        updated=updated,
        items=response_items,
    )

