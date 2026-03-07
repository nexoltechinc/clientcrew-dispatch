from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timezone
import bcrypt

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from ..core.config import ADMIN_DEFAULT_PASSWORD, ADMIN_EMAIL, ADMIN_RECOVERY_EMAIL
from ..models.admin_credential_settings import AdminCredentialSettings


ADMIN_CREDENTIAL_SETTINGS_KEY = "default"
PBKDF2_ITERATIONS = 600_000


def hash_password(password: str) -> str:
    normalized = password.strip()
    hashed = bcrypt.hashpw(normalized.encode("utf-8"), bcrypt.gensalt())
    return f"bcrypt${hashed.decode('utf-8')}"


def verify_password(password: str, stored_hash: str) -> bool:
    if stored_hash.startswith("bcrypt$"):
        bcrypt_hash = stored_hash.split("$", 1)[1]
        try:
            return bcrypt.checkpw(password.strip().encode("utf-8"), bcrypt_hash.encode("utf-8"))
        except ValueError:
            return False

    try:
        algorithm, raw_iterations, salt, digest = stored_hash.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        iterations = int(raw_iterations)
    except ValueError:
        return False

    computed = hashlib.pbkdf2_hmac(
        "sha256",
        password.strip().encode("utf-8"),
        salt.encode("utf-8"),
        iterations,
    ).hex()
    return hmac.compare_digest(computed, digest)


class AdminCredentialSettingsService:
    def __init__(self, db: Session):
        self.db = db

    def _get_or_create_settings_row(self) -> AdminCredentialSettings:
        row = (
            self.db.query(AdminCredentialSettings)
            .filter(AdminCredentialSettings.key == ADMIN_CREDENTIAL_SETTINGS_KEY)
            .first()
        )
        if row is not None:
            return row

        row = AdminCredentialSettings(
            key=ADMIN_CREDENTIAL_SETTINGS_KEY,
            admin_email=ADMIN_EMAIL,
            recovery_email=ADMIN_RECOVERY_EMAIL,
            password_hash=hash_password(ADMIN_DEFAULT_PASSWORD),
        )
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return row

    def _ensure_recovery_email(self, row: AdminCredentialSettings) -> AdminCredentialSettings:
        current_recovery_email = (row.recovery_email or "").strip().lower()
        if current_recovery_email:
            return row

        fallback_recovery_email = (row.admin_email or ADMIN_RECOVERY_EMAIL or ADMIN_EMAIL).strip().lower()
        row.recovery_email = fallback_recovery_email
        self.db.commit()
        self.db.refresh(row)
        return row

    def get_settings(self) -> dict[str, str]:
        row = self._ensure_recovery_email(self._get_or_create_settings_row())
        return {
            "admin_email": row.admin_email,
            "recovery_email": row.recovery_email,
            "password_changed_at": row.password_changed_at.isoformat(),
            "updated_at": row.updated_at.isoformat(),
        }

    def verify_admin_credentials(self, email: str, password: str) -> bool:
        normalized_email = email.strip().lower()
        normalized_password = password.strip()
        if not normalized_email or not normalized_password:
            return False

        row = self._ensure_recovery_email(self._get_or_create_settings_row())
        if normalized_email != (row.admin_email or "").strip().lower():
            return False
        return verify_password(normalized_password, row.password_hash)

    def change_password(self, current_password: str, new_password: str) -> dict[str, str]:
        normalized_current = current_password.strip()
        normalized_next = new_password.strip()
        if not normalized_current or not normalized_next:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Current and new password are required")
        if len(normalized_next) < 6:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="New password must be at least 6 characters")

        row = self._ensure_recovery_email(self._get_or_create_settings_row())
        if not verify_password(normalized_current, row.password_hash):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Current password is incorrect")
        if verify_password(normalized_next, row.password_hash):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="New password must be different from the current password")

        row.password_hash = hash_password(normalized_next)
        row.password_changed_at = datetime.now(timezone.utc)
        self.db.commit()
        self.db.refresh(row)

        return {
            "status": "ok",
            "admin_email": row.admin_email,
            "password_changed_at": row.password_changed_at.isoformat(),
        }

    def update_credentials(
        self,
        *,
        current_password: str,
        admin_email: str,
        recovery_email: str,
        new_password: str | None = None,
    ) -> dict[str, str]:
        normalized_current = current_password.strip()
        normalized_admin_email = admin_email.strip().lower()
        normalized_recovery_email = recovery_email.strip().lower()
        normalized_new_password = new_password.strip() if new_password is not None else None

        if not normalized_current:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Current password is required")
        if not normalized_admin_email or not normalized_recovery_email:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Admin and recovery emails are required")
        if normalized_new_password is not None and len(normalized_new_password) < 6:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="New password must be at least 6 characters")

        row = self._ensure_recovery_email(self._get_or_create_settings_row())
        if not verify_password(normalized_current, row.password_hash):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Current password is incorrect")

        row.admin_email = normalized_admin_email
        row.recovery_email = normalized_recovery_email

        if normalized_new_password:
            if verify_password(normalized_new_password, row.password_hash):
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="New password must be different from the current password")
            row.password_hash = hash_password(normalized_new_password)
            row.password_changed_at = datetime.now(timezone.utc)

        self.db.commit()
        self.db.refresh(row)

        return {
            "status": "ok",
            "admin_email": row.admin_email,
            "recovery_email": row.recovery_email,
            "password_changed_at": row.password_changed_at.isoformat(),
            "updated_at": row.updated_at.isoformat(),
        }
