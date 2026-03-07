from sqlalchemy import Column, DateTime, String, text
from sqlalchemy.sql import func

from .base import Base


class AdminCredentialSettings(Base):
    __tablename__ = "admin_credential_settings"

    key = Column(String(64), primary_key=True, server_default=text("'default'"))
    admin_email = Column(String(255), nullable=False)
    recovery_email = Column(String(255), nullable=True)
    password_hash = Column(String(512), nullable=False)
    password_changed_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
