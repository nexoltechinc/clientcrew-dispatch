import os
import unittest
from urllib.parse import parse_qs, urlparse
from unittest.mock import patch

from fastapi.testclient import TestClient

_TEST_DB_FILE = os.path.join(os.path.dirname(__file__), "quickbooks_oauth_test.sqlite3")
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


class QuickBooksOauthApiTests(unittest.TestCase):
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
            patch.object(integrations_quickbooks_oauth, "QB_CLIENT_ID", "qb-client-id"),
            patch.object(integrations_quickbooks_oauth, "QB_CLIENT_SECRET", "qb-client-secret"),
            patch.object(integrations_quickbooks_oauth, "QB_REDIRECT_URI", "http://localhost:8000/integrations/quickbooks/callback"),
        ]
        for item in self.patches:
            item.start()

    def tearDown(self):
        for item in reversed(self.patches):
            item.stop()

    def test_connect_redirects_to_intuit_authorize_url(self):
        response = self.client.get("/integrations/quickbooks/connect", follow_redirects=False)

        self.assertEqual(response.status_code, 307, response.text)
        self.assertIn("qb_oauth_state", response.cookies)

        location = response.headers["location"]
        parsed = urlparse(location)
        params = parse_qs(parsed.query)

        self.assertEqual(parsed.scheme, "https")
        self.assertEqual(parsed.netloc, "appcenter.intuit.com")
        self.assertEqual(parsed.path, "/connect/oauth2")
        self.assertEqual(params["client_id"][0], "qb-client-id")
        self.assertEqual(params["redirect_uri"][0], "http://localhost:8000/integrations/quickbooks/callback")
        self.assertEqual(params["response_type"][0], "code")
        self.assertEqual(params["scope"][0], "com.intuit.quickbooks.accounting")
        self.assertTrue(params["state"][0])


if __name__ == "__main__":
    unittest.main()
