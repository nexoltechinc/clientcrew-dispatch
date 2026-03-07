import os
import unittest
from uuid import uuid4

from fastapi.testclient import TestClient

_TEST_DB_FILE = os.path.join(os.path.dirname(__file__), "technician_job_lifecycle_test.sqlite3")
if os.path.exists(_TEST_DB_FILE):
    os.remove(_TEST_DB_FILE)

os.environ["APP_ENV"] = "development"
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DB_FILE.replace(os.sep, '/')}"

from app.api.deps import SessionLocal, engine
from app.main import app
from app.models.base import Base
from app.models.job import Job
from app.models.job_event import JobEvent
from app.models.technician import Technician


class TechnicianJobLifecycleApiTests(unittest.TestCase):
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
        with SessionLocal() as db:
            db.query(JobEvent).delete()
            db.query(Job).delete()
            db.query(Technician).delete()
            db.commit()

    def _seed_technician(self, *, name: str, email: str, password: str = "tech123") -> Technician:
        with SessionLocal() as db:
            row = Technician(
                id=uuid4(),
                name=name,
                full_name=name,
                email=email.lower(),
                phone="+1-418-555-0101",
                status="active",
                password=password,
                manual_availability=True,
            )
            db.add(row)
            db.commit()
            db.refresh(row)
            return row

    def _seed_job(self, *, code: str, status: str, technician_id) -> Job:
        with SessionLocal() as db:
            row = Job(
                id=uuid4(),
                job_code=code,
                status=status,
                assigned_tech_id=technician_id,
            )
            db.add(row)
            db.commit()
            db.refresh(row)
            return row

    def _technician_auth_header(self, *, email: str, password: str = "tech123") -> dict[str, str]:
        token_res = self.client.post(
            "/auth/dev/technician-token",
            json={"email": email, "password": password},
        )
        self.assertEqual(token_res.status_code, 200, token_res.text)
        return {"Authorization": f"Bearer {token_res.json()['access_token']}"}

    def test_accept_pending_job_moves_to_scheduled(self):
        tech = self._seed_technician(name="Tech A", email="techa@sm2dispatch.com")
        job = self._seed_job(code="SM2-ACCEPT-1", status="pending", technician_id=tech.id)
        tech_auth = self._technician_auth_header(email=tech.email)

        res = self.client.post(f"/technicians/me/jobs/{job.id}/accept", headers=tech_auth)
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual(res.json()["status"], "scheduled")

        with SessionLocal() as db:
            refreshed = db.query(Job).filter(Job.id == job.id).first()
            self.assertIsNotNone(refreshed)
            self.assertEqual(refreshed.status, "scheduled")
            self.assertEqual(refreshed.assigned_tech_id, tech.id)

    def test_refuse_pending_job_unassigns_and_keeps_pending(self):
        tech = self._seed_technician(name="Tech B", email="techb@sm2dispatch.com")
        job = self._seed_job(code="SM2-REFUSE-1", status="pending", technician_id=tech.id)
        tech_auth = self._technician_auth_header(email=tech.email)

        res = self.client.post(
            f"/technicians/me/jobs/{job.id}/refuse",
            headers=tech_auth,
            json={"reason": "too_far", "comment": "Out of zone"},
        )
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual(res.json()["status"], "pending")

        with SessionLocal() as db:
            refreshed = db.query(Job).filter(Job.id == job.id).first()
            self.assertIsNotNone(refreshed)
            self.assertEqual(refreshed.status, "pending")
            self.assertIsNone(refreshed.assigned_tech_id)


if __name__ == "__main__":
    unittest.main()
