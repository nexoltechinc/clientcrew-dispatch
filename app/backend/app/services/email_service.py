from __future__ import annotations

import smtplib
from email.message import EmailMessage
from pathlib import Path

from ..core.config import SMTP_APP_PASSWORD, SMTP_EMAIL, SMTP_FROM_NAME, SMTP_HOST, SMTP_PORT


class EmailService:
    def __init__(self) -> None:
        self.template_path = Path(__file__).resolve().parents[1] / "templates" / "password_reset_otp_email.html"

    def _render_password_reset_template(self, *, otp_code: str) -> str:
        template = self.template_path.read_text(encoding="utf-8")
        return template.replace("{{ otp_code }}", otp_code)

    def send_password_reset_otp(self, *, recipient_email: str, otp_code: str) -> None:
        if not SMTP_EMAIL or not SMTP_APP_PASSWORD:
            raise RuntimeError("SMTP_EMAIL and SMTP_APP_PASSWORD must be configured for password reset emails")

        message = EmailMessage()
        message["Subject"] = "Your SM2 Dispatch password reset code"
        message["From"] = f"{SMTP_FROM_NAME} <{SMTP_EMAIL}>"
        message["To"] = recipient_email
        message.set_content(
            f"Your SM2 Dispatch password reset code is {otp_code}. It expires in 5 minutes.",
        )
        message.add_alternative(
            self._render_password_reset_template(otp_code=otp_code),
            subtype="html",
        )

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as smtp:
            smtp.starttls()
            smtp.login(SMTP_EMAIL, SMTP_APP_PASSWORD)
            smtp.send_message(message)
