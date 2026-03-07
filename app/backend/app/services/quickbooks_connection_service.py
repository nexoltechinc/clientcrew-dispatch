import base64
from datetime import UTC, datetime, timedelta

import requests
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from ..core.config import QB_CLIENT_ID, QB_CLIENT_SECRET, QB_ENV
from ..models.quickbooks_connection import QuickBooksConnection


TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer"
ACCESS_TOKEN_REFRESH_BUFFER = timedelta(minutes=5)


class QuickBooksConnectionService:
    def __init__(self, db: Session):
        self.db = db

    def _get_active_connection(self) -> QuickBooksConnection | None:
        return (
            self.db.query(QuickBooksConnection)
            .filter(QuickBooksConnection.is_active.is_(True))
            .order_by(QuickBooksConnection.updated_at.desc())
            .first()
        )

    def _is_access_token_stale(self, row: QuickBooksConnection, *, now: datetime | None = None) -> bool:
        reference = now or datetime.now(UTC)
        expires_at = self._coerce_utc(row.expires_at)
        if expires_at is None:
            return True
        return expires_at <= (reference + ACCESS_TOKEN_REFRESH_BUFFER)

    def _refresh_access_token(self, row: QuickBooksConnection) -> QuickBooksConnection:
        if not QB_CLIENT_ID or not QB_CLIENT_SECRET:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="QuickBooks OAuth environment variables are not fully configured.",
            )
        if not row.refresh_token:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="QuickBooks connection does not have a refresh token.",
            )

        now = datetime.now(UTC)
        refresh_expires_at = self._coerce_utc(row.refresh_expires_at)
        if refresh_expires_at is not None and refresh_expires_at <= now:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="QuickBooks refresh token has expired. Reconnect QuickBooks.",
            )

        auth = base64.b64encode(f"{QB_CLIENT_ID}:{QB_CLIENT_SECRET}".encode("utf-8")).decode("utf-8")
        response = requests.post(
            TOKEN_URL,
            headers={
                "Authorization": f"Basic {auth}",
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "application/json",
            },
            data={
                "grant_type": "refresh_token",
                "refresh_token": row.refresh_token,
            },
            timeout=30,
        )

        try:
            payload = response.json()
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="QuickBooks refresh response was not valid JSON.",
            ) from exc

        if not response.ok:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail={
                    "message": "QuickBooks token refresh failed.",
                    "provider_status": response.status_code,
                    "provider_response": payload,
                },
            )

        payload["realmId"] = row.realm_id
        return self.upsert_connection(payload)

    def upsert_connection(self, payload: dict[str, object]) -> QuickBooksConnection:
        realm_id = str(payload.get("realmId") or "").strip()
        if not realm_id:
            raise ValueError("QuickBooks token payload did not include realmId")

        now = datetime.now(UTC)
        expires_at = now + timedelta(seconds=int(payload.get("expires_in", 0) or 0))
        refresh_expires_at = now + timedelta(seconds=int(payload.get("x_refresh_token_expires_in", 0) or 0))

        row = (
            self.db.query(QuickBooksConnection)
            .filter(QuickBooksConnection.realm_id == realm_id)
            .first()
        )

        if row is None:
            row = QuickBooksConnection(
                realm_id=realm_id,
                access_token=str(payload.get("access_token") or ""),
                refresh_token=str(payload.get("refresh_token") or ""),
                token_type=str(payload.get("token_type") or "") or None,
                scope=str(payload.get("scope") or "") or None,
                expires_at=expires_at,
                refresh_expires_at=refresh_expires_at,
                environment=QB_ENV,
                is_active=True,
            )
            self.db.add(row)
        else:
            row.access_token = str(payload.get("access_token") or "")
            row.refresh_token = str(payload.get("refresh_token") or "")
            row.token_type = str(payload.get("token_type") or "") or None
            row.scope = str(payload.get("scope") or "") or None
            row.expires_at = expires_at
            row.refresh_expires_at = refresh_expires_at
            row.environment = QB_ENV
            row.is_active = True

        (
            self.db.query(QuickBooksConnection)
            .filter(QuickBooksConnection.realm_id != realm_id, QuickBooksConnection.is_active.is_(True))
            .update({QuickBooksConnection.is_active: False}, synchronize_session=False)
        )

        self.db.commit()
        self.db.refresh(row)
        return row

    @staticmethod
    def _coerce_utc(value: datetime | None) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)

    def get_active_connection_or_raise(self, *, refresh_if_needed: bool = True) -> QuickBooksConnection:
        row = self._get_active_connection()
        if row is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="QuickBooks is not connected.",
            )
        if refresh_if_needed and self._is_access_token_stale(row):
            row = self._refresh_access_token(row)
        return row

    def get_status(self) -> dict[str, str | bool | None]:
        refresh_error: str | None = None
        row = self._get_active_connection()
        if row is None:
            return {
                "connected": False,
                "provider": "quickbooks",
                "environment": QB_ENV,
            }
        if self._is_access_token_stale(row):
            try:
                row = self.get_active_connection_or_raise(refresh_if_needed=True)
            except HTTPException as exc:
                detail = exc.detail
                refresh_error = detail if isinstance(detail, str) else str(detail)

        return {
            "connected": True,
            "provider": "quickbooks",
            "environment": row.environment,
            "realm_id": row.realm_id,
            "token_type": row.token_type,
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "updated_at": row.updated_at.isoformat() if row.updated_at else None,
            "access_token_expires_at": row.expires_at.isoformat() if row.expires_at else None,
            "refresh_token_expires_at": row.refresh_expires_at.isoformat() if row.refresh_expires_at else None,
            "is_active": row.is_active,
            "has_access_token": bool(row.access_token),
            "has_refresh_token": bool(row.refresh_token),
            "token_expired": self._is_access_token_stale(row),
            "refresh_error": refresh_error,
        }
