import os
import unittest

from fastapi.testclient import TestClient

_TEST_DB_FILE = os.path.join(os.path.dirname(__file__), "admin_settings_test.sqlite3")
if os.path.exists(_TEST_DB_FILE):
    os.remove(_TEST_DB_FILE)

os.environ["APP_ENV"] = "development"
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DB_FILE.replace(os.sep, '/')}"

from app.api.deps import engine
from app.main import app
from app.models.base import Base


class AdminSettingsApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        engine.dispose()
        if os.path.exists(_TEST_DB_FILE):
            os.remove(_TEST_DB_FILE)

    def _admin_token(self, email: str = "admin@sm2dispatch.com", password: str = "admin123") -> str:
        response = self.client.post(
            "/auth/dev/admin-token",
            json={"email": email, "password": password},
        )
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()["access_token"]

    def test_admin_credentials_settings_supports_recovery_email_updates(self):
        token = self._admin_token()

        response = self.client.get(
            "/admin/settings/admin-credentials",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["admin_email"], "admin@sm2dispatch.com")
        self.assertEqual(payload["recovery_email"], "admin@sm2dispatch.com")

        update_response = self.client.put(
            "/admin/settings/admin-credentials",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "admin_email": "owner@sm2dispatch.com",
                "recovery_email": "super@sm2dispatch.com",
                "current_password": "admin123",
                "new_password": "newpass123",
            },
        )

        self.assertEqual(update_response.status_code, 200, update_response.text)
        updated_payload = update_response.json()
        self.assertEqual(updated_payload["admin_email"], "owner@sm2dispatch.com")
        self.assertEqual(updated_payload["recovery_email"], "super@sm2dispatch.com")

        refreshed_response = self.client.get(
            "/admin/settings/admin-credentials",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(refreshed_response.status_code, 200, refreshed_response.text)
        refreshed_payload = refreshed_response.json()
        self.assertEqual(refreshed_payload["admin_email"], "owner@sm2dispatch.com")
        self.assertEqual(refreshed_payload["recovery_email"], "super@sm2dispatch.com")

        new_login_response = self.client.post(
            "/auth/dev/admin-token",
            json={"email": "owner@sm2dispatch.com", "password": "newpass123"},
        )
        self.assertEqual(new_login_response.status_code, 200, new_login_response.text)


if __name__ == "__main__":
    unittest.main()
