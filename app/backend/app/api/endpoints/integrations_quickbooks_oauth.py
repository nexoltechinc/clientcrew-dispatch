import base64
import secrets
from urllib.parse import urlencode

import requests
from fastapi import APIRouter, Cookie, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from ...api.deps import get_db
from ...core.config import QB_CLIENT_ID, QB_CLIENT_SECRET, QB_REDIRECT_URI
from ...services.quickbooks_connection_service import QuickBooksConnectionService

router = APIRouter(prefix="/integrations/quickbooks", tags=["integrations-quickbooks"])

AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2"
TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer"
DEFAULT_SCOPE = "com.intuit.quickbooks.accounting"
STATE_COOKIE_NAME = "qb_oauth_state"


@router.get("/connect")
def qb_connect(
    scope: str = Query(DEFAULT_SCOPE),
    prompt: str = Query("consent"),
) -> RedirectResponse:
    if not QB_CLIENT_ID or not QB_REDIRECT_URI:
        raise HTTPException(
            status_code=500,
            detail="QuickBooks OAuth environment variables are not fully configured.",
        )

    state = secrets.token_urlsafe(24)
    query_params = {
        "client_id": QB_CLIENT_ID,
        "redirect_uri": QB_REDIRECT_URI,
        "response_type": "code",
        "scope": scope.strip() or DEFAULT_SCOPE,
        "state": state,
    }
    prompt_value = prompt.strip()
    if prompt_value:
        query_params["prompt"] = prompt_value

    query = urlencode(query_params)
    response = RedirectResponse(url=f"{AUTHORIZE_URL}?{query}", status_code=307)
    response.set_cookie(
        key=STATE_COOKIE_NAME,
        value=state,
        httponly=True,
        samesite="lax",
        secure=QB_REDIRECT_URI.startswith("https://"),
        max_age=600,
    )
    return response


@router.get("/status")
def qb_status(db: Session = Depends(get_db)) -> dict[str, str | bool | None]:
    return QuickBooksConnectionService(db).get_status()


@router.get("/callback")
def qb_callback(
    code: str = Query(...),
    realmId: str = Query(...),
    state: str = Query(...),
    qb_oauth_state: str | None = Cookie(default=None),
    db: Session = Depends(get_db),
):
    if not QB_CLIENT_ID or not QB_CLIENT_SECRET or not QB_REDIRECT_URI:
        raise HTTPException(
            status_code=500,
            detail="QuickBooks OAuth environment variables are not fully configured.",
        )
    if not qb_oauth_state or not secrets.compare_digest(state, qb_oauth_state):
        raise HTTPException(status_code=400, detail="Invalid QuickBooks OAuth state.")

    auth = base64.b64encode(f"{QB_CLIENT_ID}:{QB_CLIENT_SECRET}".encode("utf-8")).decode("utf-8")

    headers = {
        "Authorization": f"Basic {auth}",
        "Content-Type": "application/x-www-form-urlencoded",
    }
    data = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": QB_REDIRECT_URI,
    }

    response = requests.post(TOKEN_URL, headers=headers, data=data, timeout=30)

    try:
        payload = response.json()
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="QuickBooks token response was not valid JSON.") from exc

    if not response.ok:
        raise HTTPException(status_code=response.status_code, detail=payload)

    payload["realmId"] = realmId
    stored = QuickBooksConnectionService(db).upsert_connection(payload)

    return {
        "status": "connected",
        "provider": "quickbooks",
        "environment": stored.environment,
        "realmId": stored.realm_id,
        "token_type": stored.token_type,
        "created_at": stored.created_at.isoformat() if stored.created_at else None,
        "updated_at": stored.updated_at.isoformat() if stored.updated_at else None,
        "access_token_expires_at": stored.expires_at.isoformat() if stored.expires_at else None,
        "refresh_token_expires_at": stored.refresh_expires_at.isoformat() if stored.refresh_expires_at else None,
        "is_active": stored.is_active,
    }
