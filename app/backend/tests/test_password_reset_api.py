import os
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

_TEST_DB_FILE = os.path.join(os.path.dirname(__file__), "password_reset_test.sqlite3")
if os.path.exists(_TEST_DB_FILE):
    os.remove(_TEST_DB_FILE)

os.environ["APP_ENV"] = "development"
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DB_FILE.replace(os.sep, '/')}"

from app.api.deps import engine
from app.main import app
from app.models.base import Base
from app.models.password_reset_token import PasswordResetToken


class PasswordResetApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        engine.dispose()
        if os.path.exists(_TEST_DB_FILE):
            os.remove(_TEST_DB_FILE)

    def setUp(self):
        with engine.begin() as conn:
            conn.execute(PasswordResetToken.__table__.delete())

    def test_forgot_password_returns_generic_message_for_unknown_email(self):
        response = self.client.post("/auth/forgot-password", json={"email": "missing@example.com"})

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(
            response.json()["message"],
            "If an account exists for that email, a verification code has been sent.",
        )

    def test_password_reset_flow_issues_reset_token_and_updates_admin_password(self):
        with patch("app.services.email_service.EmailService.send_password_reset_otp") as send_otp:
            captured = {}

            def remember_otp(*, recipient_email: str, otp_code: str) -> None:
                captured["recipient_email"] = recipient_email
                captured["otp_code"] = otp_code

            send_otp.side_effect = remember_otp

            forgot_response = self.client.post(
                "/auth/forgot-password",
                json={"email": "admin@sm2dispatch.com"},
            )

        self.assertEqual(forgot_response.status_code, 200, forgot_response.text)
        self.assertEqual(captured["recipient_email"], "admin@sm2dispatch.com")
        self.assertEqual(len(captured["otp_code"]), 6)

        verify_response = self.client.post(
            "/auth/verify-otp",
            json={"email": "admin@sm2dispatch.com", "otp": captured["otp_code"]},
        )
        self.assertEqual(verify_response.status_code, 200, verify_response.text)
        reset_token = verify_response.json()["reset_token"]

        reset_response = self.client.post(
            "/auth/reset-password",
            json={"reset_token": reset_token, "new_password": "resetpass123"},
        )
        self.assertEqual(reset_response.status_code, 200, reset_response.text)
        self.assertEqual(reset_response.json()["status"], "ok")

        login_response = self.client.post(
            "/auth/dev/admin-token",
            json={"email": "admin@sm2dispatch.com", "password": "resetpass123"},
        )
        self.assertEqual(login_response.status_code, 200, login_response.text)

    def test_verify_otp_increments_attempts_and_enforces_limit(self):
        with patch("app.services.email_service.EmailService.send_password_reset_otp", return_value=None):
            self.client.post("/auth/forgot-password", json={"email": "admin@sm2dispatch.com"})

        wrong_payload = {"email": "admin@sm2dispatch.com", "otp": "000000"}
        for _ in range(3):
            response = self.client.post("/auth/verify-otp", json=wrong_payload)
            self.assertEqual(response.status_code, 400, response.text)

        limited_response = self.client.post("/auth/verify-otp", json=wrong_payload)
        self.assertEqual(limited_response.status_code, 429, limited_response.text)


if __name__ == "__main__":
    unittest.main()
