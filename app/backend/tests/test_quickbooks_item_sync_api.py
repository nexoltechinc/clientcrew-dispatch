import os
import unittest
from datetime import UTC, datetime, timedelta
from unittest.mock import Mock, patch
from uuid import uuid4

from fastapi.testclient import TestClient

_TEST_DB_FILE = os.path.join(os.path.dirname(__file__), "quickbooks_item_sync_test.sqlite3")
if os.path.exists(_TEST_DB_FILE):
    os.remove(_TEST_DB_FILE)

os.environ["APP_ENV"] = "development"
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DB_FILE.replace(os.sep, '/')}"
os.environ["QB_CLIENT_ID"] = "qb-client-id"
os.environ["QB_CLIENT_SECRET"] = "qb-client-secret"
os.environ["QB_REDIRECT_URI"] = "http://localhost:8000/integrations/quickbooks/callback"

from app.api import deps
from app.api.deps import SessionLocal, engine
from app.core.enums import UserRole
from app.core.security import AuthenticatedUser
from app.main import app
from app.models.base import Base
from app.models.quickbooks_connection import QuickBooksConnection
from app.models.service_catalog import ServiceCatalog


class QuickBooksItemSyncApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)

        def override_current_user():
            return AuthenticatedUser(user_id=uuid4(), role=UserRole.ADMIN)

        app.dependency_overrides[deps.get_current_user] = override_current_user
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        app.dependency_overrides.clear()
        engine.dispose()
        if os.path.exists(_TEST_DB_FILE):
            os.remove(_TEST_DB_FILE)

    def tearDown(self):
        db = SessionLocal()
        try:
            db.query(ServiceCatalog).delete()
            db.query(QuickBooksConnection).delete()
            db.commit()
        finally:
            db.close()

    def _seed_connection(self):
        db = SessionLocal()
        try:
            db.add(
                QuickBooksConnection(
                    realm_id="9341456520395836",
                    access_token="access-token",
                    refresh_token="refresh-token",
                    token_type="bearer",
                    scope="com.intuit.quickbooks.accounting",
                    expires_at=datetime.now(UTC) + timedelta(hours=1),
                    refresh_expires_at=datetime.now(UTC) + timedelta(days=30),
                    environment="sandbox",
                    is_active=True,
                )
            )
            db.commit()
        finally:
            db.close()

    def test_sync_items_creates_and_updates_service_catalog_rows(self):
        self._seed_connection()

        mocked_query_response = Mock()
        mocked_query_response.ok = True
        mocked_query_response.json.return_value = {
            "QueryResponse": {
                "Item": [
                    {
                        "Id": "62",
                        "Name": "RFID Reader",
                        "Sku": "INN-EQUIP-61",
                        "Description": "RFID Reader",
                        "Type": "NonInventory",
                        "UnitPrice": 1950,
                        "Active": True,
                    },
                    {
                        "Id": "63",
                        "Name": "GPS Antenna",
                        "Sku": "INN-EQUIP-67",
                        "Description": "GPS Antenna",
                        "Type": "Inventory",
                        "UnitPrice": 110.7,
                        "Active": False,
                    },
                ]
            }
        }

        with patch("app.services.quickbooks_item_sync_service.requests.post", return_value=mocked_query_response):
            response = self.client.post("/admin/quickbooks/sync-items")

        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["synced_count"], 2)
        self.assertEqual(body["created_count"], 2)
        self.assertEqual(body["updated_count"], 0)
        self.assertEqual(body["archived_count"], 1)

        db = SessionLocal()
        try:
            rfid = db.query(ServiceCatalog).filter(ServiceCatalog.qb_item_id == "62").first()
            gps = db.query(ServiceCatalog).filter(ServiceCatalog.qb_item_id == "63").first()
            self.assertIsNotNone(rfid)
            self.assertEqual(rfid.code, "INN-EQUIP-61")
            self.assertEqual(str(rfid.default_price), "1950.00")
            self.assertEqual(rfid.status, "active")
            self.assertEqual(rfid.qb_type, "NonInventory")

            self.assertIsNotNone(gps)
            self.assertEqual(gps.code, "INN-EQUIP-67")
            self.assertEqual(gps.status, "archived")
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
