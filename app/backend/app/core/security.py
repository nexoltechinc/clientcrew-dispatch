from dataclasses import dataclass
import base64
import hashlib
import hmac
import json
from datetime import datetime, timezone
from uuid import UUID, uuid4

from fastapi import HTTPException, status

from .config import JWT_ALGORITHM, JWT_SECRET_KEY
from .enums import UserRole


@dataclass(frozen=True)
class AuthenticatedUser:
    user_id: UUID
    role: UserRole


@dataclass(frozen=True)
class PasswordResetSubject:
    token_id: UUID
    email: str


def _encode_segment(payload: dict) -> str:
    raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")


def _decode_segment(segment: str) -> dict:
    padding = "=" * ((4 - len(segment) % 4) % 4)
    try:
        decoded = base64.urlsafe_b64decode((segment + padding).encode("utf-8"))
        return json.loads(decoded.decode("utf-8"))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token encoding",
        ) from exc


def _decode_signature(segment: str) -> bytes:
    padding = "=" * ((4 - len(segment) % 4) % 4)
    try:
        return base64.urlsafe_b64decode((segment + padding).encode("utf-8"))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token signature encoding",
        ) from exc


def create_access_token(
    *,
    user_id: UUID,
    role: UserRole,
    expires_at: datetime,
) -> str:
    if JWT_ALGORITHM.upper() != "HS256":
        raise RuntimeError("Only HS256 JWT signing is supported")

    expiry = expires_at
    if expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=timezone.utc)
    else:
        expiry = expiry.astimezone(timezone.utc)

    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "sub": str(user_id),
        "role": role.value,
        "exp": int(expiry.timestamp()),
    }

    header_segment = _encode_segment(header)
    payload_segment = _encode_segment(payload)
    signing_input = f"{header_segment}.{payload_segment}".encode("utf-8")
    signature = hmac.new(
        JWT_SECRET_KEY.encode("utf-8"),
        signing_input,
        hashlib.sha256,
    ).digest()
    signature_segment = base64.urlsafe_b64encode(signature).decode("utf-8").rstrip("=")
    return f"{header_segment}.{payload_segment}.{signature_segment}"


def decode_access_token(token: str) -> AuthenticatedUser:
    parts = token.split(".")
    if len(parts) != 3:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token format",
        )

    header_segment, payload_segment, signature_segment = parts
    header = _decode_segment(header_segment)
    payload = _decode_segment(payload_segment)

    token_algorithm = str(header.get("alg", "")).upper()
    configured_algorithm = JWT_ALGORITHM.upper()
    if token_algorithm != configured_algorithm:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token algorithm does not match server configuration",
        )

    if configured_algorithm != "HS256":
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Only HS256 JWT verification is supported by this server",
        )

    signing_input = f"{header_segment}.{payload_segment}".encode("utf-8")
    expected_signature = hmac.new(
        JWT_SECRET_KEY.encode("utf-8"),
        signing_input,
        hashlib.sha256,
    ).digest()
    provided_signature = _decode_signature(signature_segment)

    if not hmac.compare_digest(expected_signature, provided_signature):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
        )

    exp = payload.get("exp")
    if exp is not None:
        try:
            expiry = datetime.fromtimestamp(int(exp), tz=timezone.utc)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token expiry claim",
            ) from exc
        if datetime.now(timezone.utc) >= expiry:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication token has expired",
            )

    try:
        raw_sub = payload.get("sub")
        raw_role = payload.get("role")
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token payload",
        ) from exc

    if not raw_sub or not raw_role:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing required claims",
        )

    try:
        user_id = UUID(str(raw_sub))
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token subject must be a UUID",
        ) from exc

    try:
        role = UserRole(str(raw_role).lower())
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Unsupported user role",
        ) from exc

    return AuthenticatedUser(user_id=user_id, role=role)


def create_password_reset_token(*, token_id: UUID, email: str, expires_at: datetime) -> str:
    if JWT_ALGORITHM.upper() != "HS256":
        raise RuntimeError("Only HS256 JWT signing is supported")

    expiry = expires_at if expires_at.tzinfo is not None else expires_at.replace(tzinfo=timezone.utc)
    expiry = expiry.astimezone(timezone.utc)

    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "sub": email.strip().lower(),
        "jti": str(token_id),
        "purpose": "password_reset",
        "exp": int(expiry.timestamp()),
    }

    header_segment = _encode_segment(header)
    payload_segment = _encode_segment(payload)
    signing_input = f"{header_segment}.{payload_segment}".encode("utf-8")
    signature = hmac.new(
        JWT_SECRET_KEY.encode("utf-8"),
        signing_input,
        hashlib.sha256,
    ).digest()
    signature_segment = base64.urlsafe_b64encode(signature).decode("utf-8").rstrip("=")
    return f"{header_segment}.{payload_segment}.{signature_segment}"


def decode_password_reset_token(token: str) -> PasswordResetSubject:
    parts = token.split(".")
    if len(parts) != 3:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid reset token format")

    header_segment, payload_segment, signature_segment = parts
    header = _decode_segment(header_segment)
    payload = _decode_segment(payload_segment)

    token_algorithm = str(header.get("alg", "")).upper()
    configured_algorithm = JWT_ALGORITHM.upper()
    if token_algorithm != configured_algorithm:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Reset token algorithm mismatch")

    signing_input = f"{header_segment}.{payload_segment}".encode("utf-8")
    expected_signature = hmac.new(
        JWT_SECRET_KEY.encode("utf-8"),
        signing_input,
        hashlib.sha256,
    ).digest()
    provided_signature = _decode_signature(signature_segment)

    if not hmac.compare_digest(expected_signature, provided_signature):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid reset token")

    if payload.get("purpose") != "password_reset":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid reset token purpose")

    exp = payload.get("exp")
    if exp is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Reset token missing expiry")
    expiry = datetime.fromtimestamp(int(exp), tz=timezone.utc)
    if datetime.now(timezone.utc) >= expiry:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Reset token has expired")

    raw_email = str(payload.get("sub", "")).strip().lower()
    raw_jti = payload.get("jti")
    if not raw_email or not raw_jti:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Reset token missing claims")

    try:
        token_id = UUID(str(raw_jti))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Reset token ID is invalid") from exc

    return PasswordResetSubject(token_id=token_id, email=raw_email)
