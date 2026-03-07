import base64
import hashlib
import hmac
import json
import logging
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from ...api import deps
from ...core.config import (
    QUICKBOOKS_WEBHOOK_DEVELOPMENT_VERIFIER_TOKEN,
    QUICKBOOKS_WEBHOOK_PRODUCTION_VERIFIER_TOKEN,
    QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN,
)
from ...services.quickbooks_item_sync_service import QuickBooksItemSyncService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/integrations/quickbooks", tags=["integrations-quickbooks"])


def _configured_verifier_tokens() -> list[str]:
    return [
        token
        for token in {
            QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN.strip(),
            QUICKBOOKS_WEBHOOK_DEVELOPMENT_VERIFIER_TOKEN.strip(),
            QUICKBOOKS_WEBHOOK_PRODUCTION_VERIFIER_TOKEN.strip(),
        }
        if token
    ]


def _signature_for_payload(payload: bytes, verifier_token: str) -> str:
    digest = hmac.new(
        verifier_token.encode("utf-8"),
        payload,
        hashlib.sha256,
    ).digest()
    return base64.b64encode(digest).decode("utf-8")


def _validate_intuit_signature(payload: bytes, signature: str) -> bool:
    for verifier_token in _configured_verifier_tokens():
        candidate = _signature_for_payload(payload, verifier_token)
        if hmac.compare_digest(candidate, signature):
            return True
    return False


def _extract_item_change_events(payload: Any) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []

    if isinstance(payload, list):
        for item in payload:
            if isinstance(item, dict):
                event_type = str(item.get("type") or "").lower()
                if "item" in event_type:
                    events.append(item)
        return events

    if not isinstance(payload, dict):
        return events

    notifications = payload.get("eventNotifications")
    if not isinstance(notifications, list):
        return events

    for notification in notifications:
        if not isinstance(notification, dict):
            continue
        data_change_event = notification.get("dataChangeEvent")
        if not isinstance(data_change_event, dict):
            continue
        entities = data_change_event.get("entities")
        if not isinstance(entities, list):
            continue
        for entity in entities:
            if not isinstance(entity, dict):
                continue
            if str(entity.get("name") or "").strip().lower() == "item":
                events.append(entity)

    return events


@router.get("/webhook")
def quickbooks_webhook_status() -> dict[str, Any]:
    tokens = _configured_verifier_tokens()
    return {
        "status": "ok",
        "provider": "quickbooks",
        "configured": bool(tokens),
        "path": "/integrations/quickbooks/webhook",
    }


@router.post("/webhook")
async def receive_quickbooks_webhook(
    request: Request,
    intuit_signature: str | None = Header(default=None, alias="intuit-signature"),
    db: Session = Depends(deps.get_db),
) -> dict[str, Any]:
    tokens = _configured_verifier_tokens()
    if not tokens:
        raise HTTPException(
            status_code=503,
            detail="QuickBooks webhook verifier token is not configured.",
        )

    if not intuit_signature:
        raise HTTPException(status_code=400, detail="Missing intuit-signature header.")

    payload = await request.body()
    if not payload:
        raise HTTPException(status_code=400, detail="Webhook payload is empty.")

    if not _validate_intuit_signature(payload, intuit_signature.strip()):
        raise HTTPException(status_code=401, detail="Invalid QuickBooks webhook signature.")

    try:
        parsed = json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=400, detail="Invalid QuickBooks webhook JSON payload.") from exc

    item_events = _extract_item_change_events(parsed)
    event_count = len(parsed) if isinstance(parsed, list) else len(item_events) if item_events else 1

    synced = False
    sync_result: dict[str, int] | None = None
    if item_events:
        result = QuickBooksItemSyncService(db).sync_items()
        synced = True
        sync_result = {
            "synced_count": result.synced_count,
            "created_count": result.created_count,
            "updated_count": result.updated_count,
            "archived_count": result.archived_count,
        }

    logger.info(
        "Accepted QuickBooks webhook notification with %s event(s); item_event_count=%s; synced=%s.",
        event_count,
        len(item_events),
        synced,
    )

    return {
        "status": "accepted",
        "event_count": event_count,
        "item_event_count": len(item_events),
        "synced": synced,
        "sync_result": sync_result,
    }
