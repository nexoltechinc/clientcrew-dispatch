import os
import unittest
from unittest.mock import Mock, patch

from fastapi.testclient import TestClient

_TEST_DB_FILE = os.path.join(os.path.dirname(__file__), "quickbooks_storage_test.sqlite3")
if os.path.exists(_TEST_DB_FILE):
    os.remove(_TEST_DB_FILE)

os.environ["APP_ENV"] = "development"
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DB_FILE.replace(os.sep, '/')}"
os.environ["QB_CLIENT_ID"] = "qb-client-id"
os.environ["QB_CLIENT_SECRET"] = "qb-client-secret"
os.environ["QB_REDIRECT_URI"] = "http://localhost:8000/integrations/quickbooks/callback"

from app.api.deps import engine
from app.api.endpoints import integrations_quickbooks_oauth
from app.main import app
from app.models.base import Base
from app.models.quickbooks_connection import QuickBooksConnection
from app.api.deps import SessionLocal


class QuickBooksTokenStorageApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        engine.dispose()
        if os.path.exists(_TEST_DB_FILE):
            os.remove(_TEST_DB_FILE)

    def tearDown(self):
        for item in reversed(getattr(self, "patches", [])):
            item.stop()
        db = SessionLocal()
        try:
            db.query(QuickBooksConnection).delete()
            db.commit()
        finally:
            db.close()

    def setUp(self):
        self.patches = [
            patch.object(integrations_quickbooks_oauth, "QB_CLIENT_ID", "qb-client-id"),
            patch.object(integrations_quickbooks_oauth, "QB_CLIENT_SECRET", "qb-client-secret"),
            patch.object(integrations_quickbooks_oauth, "QB_REDIRECT_URI", "http://localhost:8000/integrations/quickbooks/callback"),
        ]
        for item in self.patches:
            item.start()

    def test_status_reports_not_connected_before_callback(self):
        response = self.client.get("/integrations/quickbooks/status")
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertFalse(body["connected"])
        self.assertEqual(body["provider"], "quickbooks")

    def test_callback_stores_tokens_and_returns_sanitized_payload(self):
        connect = self.client.get("/integrations/quickbooks/connect", follow_redirects=False)
        state = connect.cookies.get("qb_oauth_state")
        self.assertTrue(state)

        mocked_response = Mock()
        mocked_response.ok = True
        mocked_response.json.return_value = {
            "access_token": "access-token",
            "refresh_token": "refresh-token",
            "token_type": "bearer",
            "expires_in": 3600,
            "x_refresh_token_expires_in": 8726400,
        }

        with patch("app.api.endpoints.integrations_quickbooks_oauth.requests.post", return_value=mocked_response):
            callback = self.client.get(
                f"/integrations/quickbooks/callback?code=abc&realmId=12345&state={state}",
            )

        self.assertEqual(callback.status_code, 200, callback.text)
        body = callback.json()
        self.assertEqual(body["status"], "connected")
        self.assertEqual(body["realmId"], "12345")
        self.assertNotIn("access_token", body)
        self.assertNotIn("refresh_token", body)

        db = SessionLocal()
        try:
            row = db.query(QuickBooksConnection).filter(QuickBooksConnection.realm_id == "12345").first()
            self.assertIsNotNone(row)
            self.assertEqual(row.environment, "sandbox")
            self.assertTrue(row.is_active)
        finally:
            db.close()

        status = self.client.get("/integrations/quickbooks/status")
        self.assertEqual(status.status_code, 200, status.text)
        status_body = status.json()
        self.assertTrue(status_body["connected"])
        self.assertTrue(status_body["has_access_token"])
        self.assertTrue(status_body["has_refresh_token"])
        self.assertEqual(status_body["realm_id"], "12345")


if __name__ == "__main__":
    unittest.main()
