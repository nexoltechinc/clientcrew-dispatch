from uuid import uuid4

from sqlalchemy import Boolean, Column, DateTime, String, Text, Uuid, text
from sqlalchemy.sql import func

from .base import Base


class QuickBooksConnection(Base):
    __tablename__ = "quickbooks_connections"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    realm_id = Column(String(64), nullable=False, unique=True)
    access_token = Column(Text, nullable=False)
    refresh_token = Column(Text, nullable=False)
    token_type = Column(String(32), nullable=True)
    scope = Column(Text, nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    refresh_expires_at = Column(DateTime(timezone=True), nullable=False)
    environment = Column(String(32), nullable=False, server_default=text("'sandbox'"))
    is_active = Column(Boolean, nullable=False, server_default=text("true"))
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
