from sqlalchemy import Column, DateTime, String, Text
from sqlalchemy.sql import func

from .base import Base


class InvoiceBrandingSettings(Base):
    __tablename__ = "invoice_branding_settings"

    key = Column(String(32), primary_key=True, default="default")
    logo_url = Column(Text, nullable=True)
    name = Column(String(255), nullable=False)
    street_address = Column(Text, nullable=False)
    city = Column(String(128), nullable=False)
    state = Column(String(128), nullable=False)
    zip_code = Column(String(32), nullable=False)
    phone = Column(String(64), nullable=False)
    email = Column(String(255), nullable=False)
    website = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
