from sqlalchemy.orm import Session

from ..core.config import (
    COMPANY_CITY,
    COMPANY_EMAIL,
    COMPANY_LOGO_URL,
    COMPANY_NAME,
    COMPANY_PHONE,
    COMPANY_STATE,
    COMPANY_STREET_ADDRESS,
    COMPANY_WEBSITE,
    COMPANY_ZIP_CODE,
)
from ..models.invoice_branding_settings import InvoiceBrandingSettings
from ..schemas.settings import InvoiceBrandingSettingsPayload, InvoiceBrandingSettingsResponse


INVOICE_BRANDING_SETTINGS_KEY = "default"


def get_default_invoice_branding_payload() -> InvoiceBrandingSettingsPayload:
    return InvoiceBrandingSettingsPayload(
        logo_url=COMPANY_LOGO_URL or None,
        name=COMPANY_NAME,
        street_address=COMPANY_STREET_ADDRESS,
        city=COMPANY_CITY,
        state=COMPANY_STATE,
        zip_code=COMPANY_ZIP_CODE,
        phone=COMPANY_PHONE,
        email=COMPANY_EMAIL,
        website=COMPANY_WEBSITE,
    )


class InvoiceBrandingSettingsService:
    def __init__(self, db: Session):
        self.db = db

    def _get_settings_row(self) -> InvoiceBrandingSettings | None:
        return (
            self.db.query(InvoiceBrandingSettings)
            .filter(InvoiceBrandingSettings.key == INVOICE_BRANDING_SETTINGS_KEY)
            .first()
        )

    def get_invoice_branding(self) -> InvoiceBrandingSettingsResponse:
        row = self._get_settings_row()
        if row is None:
            return InvoiceBrandingSettingsResponse.model_validate(
                get_default_invoice_branding_payload().model_dump()
            )
        return InvoiceBrandingSettingsResponse.model_validate(row, from_attributes=True)

    def upsert_invoice_branding(
        self,
        payload: InvoiceBrandingSettingsPayload,
    ) -> InvoiceBrandingSettingsResponse:
        row = self._get_settings_row()
        if row is None:
            row = InvoiceBrandingSettings(
                key=INVOICE_BRANDING_SETTINGS_KEY,
                logo_url=payload.logo_url,
                name=payload.name,
                street_address=payload.street_address,
                city=payload.city,
                state=payload.state,
                zip_code=payload.zip_code,
                phone=payload.phone,
                email=payload.email,
                website=payload.website,
            )
            self.db.add(row)
        else:
            row.logo_url = payload.logo_url
            row.name = payload.name
            row.street_address = payload.street_address
            row.city = payload.city
            row.state = payload.state
            row.zip_code = payload.zip_code
            row.phone = payload.phone
            row.email = payload.email
            row.website = payload.website

        self.db.commit()
        self.db.refresh(row)
        return InvoiceBrandingSettingsResponse.model_validate(row, from_attributes=True)
