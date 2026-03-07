from uuid import uuid4

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text, Uuid, func, text

from .base import Base


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    email = Column(String(255), nullable=False, index=True)
    otp_hash = Column(String(64), nullable=False)
    delivery_email = Column(String(255), nullable=False)
    attempts = Column(Integer, nullable=False, server_default=text("0"))
    is_used = Column(Boolean, nullable=False, server_default=text("false"))
    verified_at = Column(DateTime(timezone=True), nullable=True)
    used_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
