import base64
import hashlib
import hmac
import json
import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient

_TEST_DB_FILE = os.path.join(os.path.dirname(__file__), "quickbooks_webhook_test.sqlite3")
if os.path.exists(_TEST_DB_FILE):
    os.remove(_TEST_DB_FILE)

os.environ["APP_ENV"] = "development"
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DB_FILE.replace(os.sep, '/')}"
os.environ["QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN"] = "qb-webhook-test-token"

from app.api.deps import engine
from app.api.endpoints import integrations_quickbooks_webhooks
from app.main import app
from app.models.base import Base


def _signature(payload: bytes, verifier_token: str) -> str:
    digest = hmac.new(
        verifier_token.encode("utf-8"),
        payload,
        hashlib.sha256,
    ).digest()
    return base64.b64encode(digest).decode("utf-8")


class QuickBooksWebhookApiTests(unittest.TestCase):
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
        self.patches = [
            patch.object(integrations_quickbooks_webhooks, "QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN", "qb-webhook-test-token"),
            patch.object(integrations_quickbooks_webhooks, "QUICKBOOKS_WEBHOOK_DEVELOPMENT_VERIFIER_TOKEN", ""),
            patch.object(integrations_quickbooks_webhooks, "QUICKBOOKS_WEBHOOK_PRODUCTION_VERIFIER_TOKEN", ""),
        ]
        for item in self.patches:
            item.start()

    def tearDown(self):
        for item in reversed(self.patches):
            item.stop()

    def test_status_endpoint_reports_configured(self):
        res = self.client.get("/integrations/quickbooks/webhook")
        self.assertEqual(res.status_code, 200, res.text)
        body = res.json()
        self.assertEqual(body["status"], "ok")
        self.assertEqual(body["provider"], "quickbooks")
        self.assertTrue(body["configured"])

    def test_webhook_accepts_valid_signature(self):
        payload = b'[{"type":"qbo.bill.created.v1","intuitaccountid":"123"}]'
        signature = _signature(payload, "qb-webhook-test-token")

        with patch("app.api.endpoints.integrations_quickbooks_webhooks.QuickBooksItemSyncService.sync_items") as sync_items:
            res = self.client.post(
                "/integrations/quickbooks/webhook",
                content=payload,
                headers={"intuit-signature": signature, "content-type": "application/json"},
            )
            sync_items.assert_not_called()

        self.assertEqual(res.status_code, 200, res.text)
        body = res.json()
        self.assertEqual(body["status"], "accepted")
        self.assertEqual(body["event_count"], 1)
        self.assertEqual(body["item_event_count"], 0)
        self.assertFalse(body["synced"])

    def test_webhook_rejects_invalid_signature(self):
        payload = b'[{"type":"qbo.bill.created.v1","intuitaccountid":"123"}]'

        res = self.client.post(
            "/integrations/quickbooks/webhook",
            content=payload,
            headers={"intuit-signature": "invalid-signature", "content-type": "application/json"},
        )
        self.assertEqual(res.status_code, 401, res.text)
        self.assertEqual(res.json()["detail"], "Invalid QuickBooks webhook signature.")

    def test_webhook_syncs_on_item_data_change_event(self):
        payload_obj = {
            "eventNotifications": [
                {
                    "realmId": "12345",
                    "dataChangeEvent": {
                        "entities": [
                            {"name": "Item", "id": "10", "operation": "Create"},
                        ]
                    },
                }
            ]
        }
        payload = json.dumps(payload_obj).encode("utf-8")
        signature = _signature(payload, "qb-webhook-test-token")

        with patch(
            "app.api.endpoints.integrations_quickbooks_webhooks.QuickBooksItemSyncService.sync_items"
        ) as sync_items:
            sync_items.return_value = SimpleNamespace(
                synced_count=3,
                created_count=1,
                updated_count=2,
                archived_count=0,
            )
            res = self.client.post(
                "/integrations/quickbooks/webhook",
                content=payload,
                headers={"intuit-signature": signature, "content-type": "application/json"},
            )

        self.assertEqual(res.status_code, 200, res.text)
        body = res.json()
        self.assertEqual(body["status"], "accepted")
        self.assertEqual(body["item_event_count"], 1)
        self.assertTrue(body["synced"])
        self.assertEqual(body["sync_result"]["created_count"], 1)
        sync_items.assert_called_once()


if __name__ == "__main__":
    unittest.main()
