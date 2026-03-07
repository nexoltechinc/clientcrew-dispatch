import os
import unittest
from datetime import date, time
from uuid import UUID

from fastapi.testclient import TestClient

_TEST_DB_FILE = os.path.join(os.path.dirname(__file__), "make_job_intake_test.sqlite3")
if os.path.exists(_TEST_DB_FILE):
    os.remove(_TEST_DB_FILE)

os.environ["APP_ENV"] = "development"
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DB_FILE.replace(os.sep, '/')}"

from app.api.deps import SessionLocal, engine
from app.main import app
from app.models.base import Base
from app.models.dealership import Dealership
from app.models.job import Job
from app.models.job_event import JobEvent
from app.models.skill import Skill, technician_skills
from app.models.technician import Technician
from app.models.zone import Zone, technician_zones


class MakeJobIntakeApiTests(unittest.TestCase):
    ADMIN_TOKEN_PAYLOAD = {"email": "admin@sm2dispatch.com", "password": "admin123"}

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
            db.query(Job).delete()
            db.query(Technician).delete()
            db.query(Dealership).delete()
            db.commit()

    def _make_payload(self, *, time_value: str = "09:30") -> list[dict]:
        return [
            {
                "job_id": "SM2-20231201-1234",
                "dealership": {
                    "dealership_name": "Audi levis",
                    "Téléphone": "+13438421791",
                    "service": "démarreur à distance",
                },
                "vehicle": "audi a3 2026",
                "vehicle_number": "26043",
                "date": "2026-01-15",
                "time": time_value,
                "urgent": True,
                "confidence": 84,
                "flags": ["AUDI_PRICING"],
                "raw": "",
            }
        ]

    def test_make_job_intake_creates_admin_review_job(self):
        res = self.client.post("/integrations/make/jobs", json=self._make_payload())
        self.assertEqual(res.status_code, 201, res.text)
        body = res.json()

        self.assertEqual(body["total"], 1)
        self.assertEqual(body["created"], 1)
        self.assertEqual(body["updated"], 0)
        self.assertEqual(body["items"][0]["job_code"], "SM2-20231201-1234")
        self.assertEqual(body["items"][0]["status"], "admin_review")
        self.assertEqual(body["items"][0]["action"], "created")
        self.assertEqual(body["items"][0]["requested_service_date"], "2026-01-15")
        self.assertEqual(body["items"][0]["requested_service_time"], "09:30:00")

        with SessionLocal() as db:
            job = db.query(Job).filter(Job.job_code == "SM2-20231201-1234").first()
            self.assertIsNotNone(job)
            self.assertEqual(job.status, "admin_review")
            self.assertEqual(job.vehicle, "audi a3 2026")
            self.assertEqual(job.service_type, "démarreur à distance")
            self.assertEqual(job.requested_service_date, date(2026, 1, 15))
            self.assertEqual(job.requested_service_time, time(9, 30))
            self.assertEqual(job.source_system, "make.com")
            self.assertIsNotNone(job.source_metadata)
            self.assertEqual(job.source_metadata["vehicle_number"], "26043")
            self.assertTrue(job.source_metadata["urgent"])
            self.assertEqual(job.source_metadata["confidence"], 84)
            self.assertEqual(job.source_metadata["flags"], ["AUDI_PRICING"])
            self.assertIsNotNone(job.dealership_id)

            dealership = db.query(Dealership).filter(Dealership.id == job.dealership_id).first()
            self.assertIsNotNone(dealership)
            self.assertEqual(dealership.name, "Audi levis")
            self.assertEqual(dealership.phone, "+13438421791")

    def test_make_job_intake_retry_creates_new_job_without_overwriting_previous(self):
        create_res = self.client.post("/integrations/make/jobs", json=self._make_payload())
        self.assertEqual(create_res.status_code, 201, create_res.text)

        with SessionLocal() as db:
            job = db.query(Job).filter(Job.job_code == "SM2-20231201-1234").first()
            self.assertIsNotNone(job)
            job.status = "scheduled"
            db.commit()

        retry_payload = self._make_payload(time_value="10:45")
        retry_payload[0]["vehicle"] = "audi a3 2026 updated"
        retry_payload[0]["dealership"]["Téléphone"] = "+13430000000"

        retry_res = self.client.post("/integrations/make/jobs", json=retry_payload)
        self.assertEqual(retry_res.status_code, 201, retry_res.text)
        body = retry_res.json()
        self.assertEqual(body["created"], 1)
        self.assertEqual(body["updated"], 0)
        self.assertEqual(body["items"][0]["action"], "created")
        self.assertEqual(body["items"][0]["status"], "admin_review")
        self.assertEqual(body["items"][0]["job_code"], "SM2-20231201-1234-0001")
        self.assertEqual(body["items"][0]["requested_service_time"], "10:45:00")

        with SessionLocal() as db:
            original_job = db.query(Job).filter(Job.job_code == "SM2-20231201-1234").first()
            self.assertIsNotNone(original_job)
            self.assertEqual(original_job.status, "scheduled")
            self.assertEqual(original_job.vehicle, "audi a3 2026")
            self.assertEqual(original_job.requested_service_time, time(9, 30))

            new_job = db.query(Job).filter(Job.job_code == "SM2-20231201-1234-0001").first()
            self.assertIsNotNone(new_job)
            self.assertEqual(new_job.status, "admin_review")
            self.assertEqual(new_job.vehicle, "audi a3 2026 updated")
            self.assertEqual(new_job.requested_service_time, time(10, 45))

            dealership = db.query(Dealership).filter(Dealership.id == new_job.dealership_id).first()
            self.assertIsNotNone(dealership)
            self.assertEqual(dealership.phone, "+13430000000")

    def test_admin_can_list_and_delete_ingested_job(self):
        create_res = self.client.post("/integrations/make/jobs", json=self._make_payload())
        self.assertEqual(create_res.status_code, 201, create_res.text)

        token_response = self.client.post("/auth/dev/admin-token", json=self.ADMIN_TOKEN_PAYLOAD)
        self.assertEqual(token_response.status_code, 200, token_response.text)
        auth_header = {"Authorization": f"Bearer {token_response.json()['access_token']}"}

        list_res = self.client.get("/admin/jobs", headers=auth_header)
        self.assertEqual(list_res.status_code, 200, list_res.text)
        jobs = list_res.json()
        self.assertEqual(len(jobs), 1)
        self.assertEqual(jobs[0]["job_code"], "SM2-20231201-1234")
        self.assertEqual(jobs[0]["status"], "ADMIN_PREVIEW")
        job_id = jobs[0]["id"]

        delete_res = self.client.delete(f"/admin/jobs/{job_id}", headers=auth_header)
        self.assertEqual(delete_res.status_code, 200, delete_res.text)
        self.assertEqual(delete_res.json()["status"], "ok")

        list_after_delete_res = self.client.get("/admin/jobs", headers=auth_header)
        self.assertEqual(list_after_delete_res.status_code, 200, list_after_delete_res.text)
        self.assertEqual(list_after_delete_res.json(), [])

    def test_admin_can_update_job_assignment(self):
        create_res = self.client.post("/integrations/make/jobs", json=self._make_payload())
        self.assertEqual(create_res.status_code, 201, create_res.text)

        token_response = self.client.post("/auth/dev/admin-token", json=self.ADMIN_TOKEN_PAYLOAD)
        self.assertEqual(token_response.status_code, 200, token_response.text)
        auth_header = {"Authorization": f"Bearer {token_response.json()['access_token']}"}

        with SessionLocal() as db:
            tech = Technician(name="Dany", email="dany@example.com", status="active")
            db.add(tech)
            db.commit()
            db.refresh(tech)
            tech_id = str(tech.id)

        list_res = self.client.get("/admin/jobs", headers=auth_header)
        self.assertEqual(list_res.status_code, 200, list_res.text)
        jobs = list_res.json()
        self.assertEqual(len(jobs), 1)
        job_id = jobs[0]["id"]

        assign_res = self.client.patch(
            f"/admin/jobs/{job_id}/assignment",
            headers=auth_header,
            json={"assigned_technician_id": tech_id},
        )
        self.assertEqual(assign_res.status_code, 200, assign_res.text)
        self.assertEqual(assign_res.json()["assigned_technician_id"], tech_id)
        self.assertEqual(assign_res.json()["assigned_technician_name"], "Dany")

        with SessionLocal() as db:
            job = db.query(Job).filter(Job.job_code == "SM2-20231201-1234").first()
            self.assertIsNotNone(job)
            self.assertEqual(str(job.assigned_tech_id), tech_id)

        unassign_res = self.client.patch(
            f"/admin/jobs/{job_id}/assignment",
            headers=auth_header,
            json={"assigned_technician_id": None},
        )
        self.assertEqual(unassign_res.status_code, 200, unassign_res.text)
        self.assertIsNone(unassign_res.json()["assigned_technician_id"])

    def test_admin_can_confirm_job(self):
        create_res = self.client.post("/integrations/make/jobs", json=self._make_payload())
        self.assertEqual(create_res.status_code, 201, create_res.text)

        token_response = self.client.post("/auth/dev/admin-token", json=self.ADMIN_TOKEN_PAYLOAD)
        self.assertEqual(token_response.status_code, 200, token_response.text)
        auth_header = {"Authorization": f"Bearer {token_response.json()['access_token']}"}

        with SessionLocal() as db:
            tech = Technician(name="Confirm Tech", email="confirm-tech@example.com", status="active")
            db.add(tech)
            db.commit()
            db.refresh(tech)
            tech_id = str(tech.id)

        list_res = self.client.get("/admin/jobs", headers=auth_header)
        self.assertEqual(list_res.status_code, 200, list_res.text)
        job_id = list_res.json()[0]["id"]

        assign_res = self.client.patch(
            f"/admin/jobs/{job_id}/assignment",
            headers=auth_header,
            json={"assigned_technician_id": tech_id},
        )
        self.assertEqual(assign_res.status_code, 200, assign_res.text)

        confirm_res = self.client.post(f"/admin/jobs/{job_id}/confirm", headers=auth_header)
        self.assertEqual(confirm_res.status_code, 200, confirm_res.text)
        self.assertEqual(confirm_res.json()["status"], "SCHEDULED")

    def test_confirmed_job_is_visible_in_technician_feed(self):
        create_res = self.client.post("/integrations/make/jobs", json=self._make_payload())
        self.assertEqual(create_res.status_code, 201, create_res.text)

        with SessionLocal() as db:
            tech = Technician(name="Dany", email="dany-feed@example.com", status="active", password="tech123")
            db.add(tech)
            db.commit()
            db.refresh(tech)
            tech_id = str(tech.id)

        admin_token_response = self.client.post("/auth/dev/admin-token", json=self.ADMIN_TOKEN_PAYLOAD)
        self.assertEqual(admin_token_response.status_code, 200, admin_token_response.text)
        admin_header = {"Authorization": f"Bearer {admin_token_response.json()['access_token']}"}

        jobs_res = self.client.get("/admin/jobs", headers=admin_header)
        self.assertEqual(jobs_res.status_code, 200, jobs_res.text)
        job_id = jobs_res.json()[0]["id"]

        assign_res = self.client.patch(
            f"/admin/jobs/{job_id}/assignment",
            headers=admin_header,
            json={"assigned_technician_id": tech_id},
        )
        self.assertEqual(assign_res.status_code, 200, assign_res.text)

        confirm_res = self.client.post(f"/admin/jobs/{job_id}/confirm", headers=admin_header)
        self.assertEqual(confirm_res.status_code, 200, confirm_res.text)

        tech_token_res = self.client.post(
            "/auth/dev/technician-token",
            json={"email": "dany-feed@example.com", "password": "tech123"},
        )
        self.assertEqual(tech_token_res.status_code, 200, tech_token_res.text)
        tech_header = {"Authorization": f"Bearer {tech_token_res.json()['access_token']}"}

        feed_res = self.client.get("/technicians/me/jobs-feed", headers=tech_header)
        self.assertEqual(feed_res.status_code, 200, feed_res.text)
        body = feed_res.json()
        self.assertGreaterEqual(len(body["my_jobs"]), 1)
        self.assertEqual(body["my_jobs"][0]["status"], "SCHEDULED")

    def test_confirm_without_assignment_returns_error(self):
        create_res = self.client.post("/integrations/make/jobs", json=self._make_payload())
        self.assertEqual(create_res.status_code, 201, create_res.text)

        token_response = self.client.post("/auth/dev/admin-token", json=self.ADMIN_TOKEN_PAYLOAD)
        self.assertEqual(token_response.status_code, 200, token_response.text)
        auth_header = {"Authorization": f"Bearer {token_response.json()['access_token']}"}

        list_res = self.client.get("/admin/jobs", headers=auth_header)
        self.assertEqual(list_res.status_code, 200, list_res.text)
        job_id = list_res.json()[0]["id"]

        confirm_res = self.client.post(f"/admin/jobs/{job_id}/confirm", headers=auth_header)
        self.assertEqual(confirm_res.status_code, 400, confirm_res.text)
        self.assertEqual(confirm_res.json()["detail"], "Assign a technician before confirming this job.")

    def test_confirm_with_preassigned_promotes_and_succeeds(self):
        create_res = self.client.post("/integrations/make/jobs", json=self._make_payload())
        self.assertEqual(create_res.status_code, 201, create_res.text)

        with SessionLocal() as db:
            tech = Technician(name="Preassigned Tech", email="preassigned-tech@example.com", status="active")
            db.add(tech)
            db.commit()
            db.refresh(tech)
            tech_id = str(tech.id)

            job = db.query(Job).filter(Job.job_code == "SM2-20231201-1234").first()
            self.assertIsNotNone(job)
            job.pre_assigned_technician_id = tech.id
            db.commit()

        token_response = self.client.post("/auth/dev/admin-token", json=self.ADMIN_TOKEN_PAYLOAD)
        self.assertEqual(token_response.status_code, 200, token_response.text)
        auth_header = {"Authorization": f"Bearer {token_response.json()['access_token']}"}

        list_res = self.client.get("/admin/jobs", headers=auth_header)
        self.assertEqual(list_res.status_code, 200, list_res.text)
        job_id = list_res.json()[0]["id"]

        confirm_res = self.client.post(f"/admin/jobs/{job_id}/confirm", headers=auth_header)
        self.assertEqual(confirm_res.status_code, 200, confirm_res.text)
        self.assertEqual(confirm_res.json()["status"], "SCHEDULED")
        self.assertEqual(confirm_res.json()["assigned_technician_id"], tech_id)

    def test_confirm_twice_is_idempotent(self):
        create_res = self.client.post("/integrations/make/jobs", json=self._make_payload())
        self.assertEqual(create_res.status_code, 201, create_res.text)

        with SessionLocal() as db:
            tech = Technician(name="Idempotent Tech", email="idempotent-tech@example.com", status="active")
            db.add(tech)
            db.commit()
            db.refresh(tech)
            tech_id = str(tech.id)

        token_response = self.client.post("/auth/dev/admin-token", json=self.ADMIN_TOKEN_PAYLOAD)
        self.assertEqual(token_response.status_code, 200, token_response.text)
        auth_header = {"Authorization": f"Bearer {token_response.json()['access_token']}"}

        list_res = self.client.get("/admin/jobs", headers=auth_header)
        self.assertEqual(list_res.status_code, 200, list_res.text)
        job_id = list_res.json()[0]["id"]

        assign_res = self.client.patch(
            f"/admin/jobs/{job_id}/assignment",
            headers=auth_header,
            json={"assigned_technician_id": tech_id},
        )
        self.assertEqual(assign_res.status_code, 200, assign_res.text)

        first_confirm_res = self.client.post(f"/admin/jobs/{job_id}/confirm", headers=auth_header)
        self.assertEqual(first_confirm_res.status_code, 200, first_confirm_res.text)
        self.assertEqual(first_confirm_res.json()["status"], "SCHEDULED")
        self.assertEqual(first_confirm_res.json()["assigned_technician_id"], tech_id)

        second_confirm_res = self.client.post(f"/admin/jobs/{job_id}/confirm", headers=auth_header)
        self.assertEqual(second_confirm_res.status_code, 200, second_confirm_res.text)
        self.assertEqual(second_confirm_res.json()["status"], "SCHEDULED")
        self.assertEqual(second_confirm_res.json()["assigned_technician_id"], tech_id)

        with SessionLocal() as db:
            row = db.query(Job).filter(Job.job_code == "SM2-20231201-1234").first()
            self.assertIsNotNone(row)
            self.assertEqual(str(row.assigned_tech_id), tech_id)
            self.assertEqual(row.status, "scheduled")
            events = db.query(JobEvent).filter(JobEvent.job_id == UUID(job_id)).all()
            # Make intake may insert one pre-assignment audit event; confirm must not duplicate events.
            self.assertEqual(len(events), 1)

    def test_unassigning_scheduled_job_resets_status_to_pending(self):
        create_res = self.client.post("/integrations/make/jobs", json=self._make_payload())
        self.assertEqual(create_res.status_code, 201, create_res.text)

        with SessionLocal() as db:
            tech = Technician(name="Ghost Guard", email="ghost-guard@example.com", status="active")
            db.add(tech)
            db.commit()
            db.refresh(tech)
            tech_id = str(tech.id)

        token_response = self.client.post("/auth/dev/admin-token", json=self.ADMIN_TOKEN_PAYLOAD)
        self.assertEqual(token_response.status_code, 200, token_response.text)
        auth_header = {"Authorization": f"Bearer {token_response.json()['access_token']}"}

        list_res = self.client.get("/admin/jobs", headers=auth_header)
        self.assertEqual(list_res.status_code, 200, list_res.text)
        job_id = list_res.json()[0]["id"]

        assign_res = self.client.patch(
            f"/admin/jobs/{job_id}/assignment",
            headers=auth_header,
            json={"assigned_technician_id": tech_id},
        )
        self.assertEqual(assign_res.status_code, 200, assign_res.text)

        confirm_res = self.client.post(f"/admin/jobs/{job_id}/confirm", headers=auth_header)
        self.assertEqual(confirm_res.status_code, 200, confirm_res.text)
        self.assertEqual(confirm_res.json()["status"], "SCHEDULED")

        unassign_res = self.client.patch(
            f"/admin/jobs/{job_id}/assignment",
            headers=auth_header,
            json={"assigned_technician_id": None},
        )
        self.assertEqual(unassign_res.status_code, 200, unassign_res.text)
        self.assertIsNone(unassign_res.json()["assigned_technician_id"])
        self.assertEqual(unassign_res.json()["status"], "PENDING")

    def test_reassigning_scheduled_job_is_allowed_and_keeps_scheduled(self):
        create_res = self.client.post("/integrations/make/jobs", json=self._make_payload())
        self.assertEqual(create_res.status_code, 201, create_res.text)

        with SessionLocal() as db:
            tech_a = Technician(name="Tech A", email="tech-a@example.com", status="active")
            tech_b = Technician(name="Tech B", email="tech-b@example.com", status="active")
            db.add(tech_a)
            db.add(tech_b)
            db.commit()
            db.refresh(tech_a)
            db.refresh(tech_b)
            tech_a_id = str(tech_a.id)
            tech_b_id = str(tech_b.id)

        token_response = self.client.post("/auth/dev/admin-token", json=self.ADMIN_TOKEN_PAYLOAD)
        self.assertEqual(token_response.status_code, 200, token_response.text)
        auth_header = {"Authorization": f"Bearer {token_response.json()['access_token']}"}

        list_res = self.client.get("/admin/jobs", headers=auth_header)
        self.assertEqual(list_res.status_code, 200, list_res.text)
        job_id = list_res.json()[0]["id"]

        assign_first_res = self.client.patch(
            f"/admin/jobs/{job_id}/assignment",
            headers=auth_header,
            json={"assigned_technician_id": tech_a_id},
        )
        self.assertEqual(assign_first_res.status_code, 200, assign_first_res.text)

        confirm_res = self.client.post(f"/admin/jobs/{job_id}/confirm", headers=auth_header)
        self.assertEqual(confirm_res.status_code, 200, confirm_res.text)
        self.assertEqual(confirm_res.json()["status"], "SCHEDULED")
        self.assertEqual(confirm_res.json()["assigned_technician_id"], tech_a_id)

        reassign_res = self.client.patch(
            f"/admin/jobs/{job_id}/assignment",
            headers=auth_header,
            json={"assigned_technician_id": tech_b_id},
        )
        self.assertEqual(reassign_res.status_code, 200, reassign_res.text)
        self.assertEqual(reassign_res.json()["status"], "SCHEDULED")
        self.assertEqual(reassign_res.json()["assigned_technician_id"], tech_b_id)

    def test_technician_my_job_start_and_complete_persist(self):
        create_res = self.client.post("/integrations/make/jobs", json=self._make_payload())
        self.assertEqual(create_res.status_code, 201, create_res.text)

        with SessionLocal() as db:
            tech = Technician(name="Victor", email="victor-flow@example.com", status="active", password="tech123")
            db.add(tech)
            db.commit()
            db.refresh(tech)
            tech_id = str(tech.id)

        admin_token_response = self.client.post("/auth/dev/admin-token", json=self.ADMIN_TOKEN_PAYLOAD)
        self.assertEqual(admin_token_response.status_code, 200, admin_token_response.text)
        admin_header = {"Authorization": f"Bearer {admin_token_response.json()['access_token']}"}

        jobs_res = self.client.get("/admin/jobs", headers=admin_header)
        self.assertEqual(jobs_res.status_code, 200, jobs_res.text)
        job_id = jobs_res.json()[0]["id"]

        assign_res = self.client.patch(
            f"/admin/jobs/{job_id}/assignment",
            headers=admin_header,
            json={"assigned_technician_id": tech_id},
        )
        self.assertEqual(assign_res.status_code, 200, assign_res.text)

        confirm_res = self.client.post(f"/admin/jobs/{job_id}/confirm", headers=admin_header)
        self.assertEqual(confirm_res.status_code, 200, confirm_res.text)

        tech_token_res = self.client.post(
            "/auth/dev/technician-token",
            json={"email": "victor-flow@example.com", "password": "tech123"},
        )
        self.assertEqual(tech_token_res.status_code, 200, tech_token_res.text)
        tech_header = {"Authorization": f"Bearer {tech_token_res.json()['access_token']}"}

        start_res = self.client.post(f"/technicians/me/jobs/{job_id}/start", headers=tech_header)
        self.assertEqual(start_res.status_code, 200, start_res.text)

        feed_after_start = self.client.get("/technicians/me/jobs-feed", headers=tech_header)
        self.assertEqual(feed_after_start.status_code, 200, feed_after_start.text)
        self.assertEqual(feed_after_start.json()["my_jobs"][0]["status"], "IN_PROGRESS")

        complete_res = self.client.post(f"/technicians/me/jobs/{job_id}/complete", headers=tech_header)
        self.assertEqual(complete_res.status_code, 200, complete_res.text)

        feed_after_complete = self.client.get("/technicians/me/jobs-feed", headers=tech_header)
        self.assertEqual(feed_after_complete.status_code, 200, feed_after_complete.text)
        self.assertEqual(feed_after_complete.json()["my_jobs"][0]["status"], "COMPLETED")

    def test_technician_my_job_delay_and_refuse_persist(self):
        create_res = self.client.post("/integrations/make/jobs", json=self._make_payload())
        self.assertEqual(create_res.status_code, 201, create_res.text)

        with SessionLocal() as db:
            tech = Technician(name="Maxime", email="maxime-flow@example.com", status="active", password="tech123")
            db.add(tech)
            db.commit()
            db.refresh(tech)
            tech_id = str(tech.id)

        admin_token_response = self.client.post("/auth/dev/admin-token", json=self.ADMIN_TOKEN_PAYLOAD)
        self.assertEqual(admin_token_response.status_code, 200, admin_token_response.text)
        admin_header = {"Authorization": f"Bearer {admin_token_response.json()['access_token']}"}

        jobs_res = self.client.get("/admin/jobs", headers=admin_header)
        self.assertEqual(jobs_res.status_code, 200, jobs_res.text)
        job_id = jobs_res.json()[0]["id"]

        assign_res = self.client.patch(
            f"/admin/jobs/{job_id}/assignment",
            headers=admin_header,
            json={"assigned_technician_id": tech_id},
        )
        self.assertEqual(assign_res.status_code, 200, assign_res.text)

        confirm_res = self.client.post(f"/admin/jobs/{job_id}/confirm", headers=admin_header)
        self.assertEqual(confirm_res.status_code, 200, confirm_res.text)

        tech_token_res = self.client.post(
            "/auth/dev/technician-token",
            json={"email": "maxime-flow@example.com", "password": "tech123"},
        )
        self.assertEqual(tech_token_res.status_code, 200, tech_token_res.text)
        tech_header = {"Authorization": f"Bearer {tech_token_res.json()['access_token']}"}

        delay_res = self.client.post(
            f"/technicians/me/jobs/{job_id}/delay",
            headers=tech_header,
            json={"minutes": 30, "note": "Traffic"},
        )
        self.assertEqual(delay_res.status_code, 200, delay_res.text)

        feed_after_delay = self.client.get("/technicians/me/jobs-feed", headers=tech_header)
        self.assertEqual(feed_after_delay.status_code, 200, feed_after_delay.text)
        self.assertEqual(feed_after_delay.json()["my_jobs"][0]["status"], "DELAYED")

        refuse_res = self.client.post(
            f"/technicians/me/jobs/{job_id}/refuse",
            headers=tech_header,
            json={"reason": "schedule_conflict", "comment": "Cannot continue"},
        )
        self.assertEqual(refuse_res.status_code, 200, refuse_res.text)

        feed_after_refuse = self.client.get("/technicians/me/jobs-feed", headers=tech_header)
        self.assertEqual(feed_after_refuse.status_code, 200, feed_after_refuse.text)
        self.assertEqual(feed_after_refuse.json()["my_jobs"], [])

    def test_unknown_status_is_not_silently_hidden(self):
        with SessionLocal() as db:
            tech = Technician(name="Unknown Tech", email="unknown-tech@example.com", status="active", password="tech123")
            db.add(tech)
            db.flush()
            job = Job(
                job_code="SM2-UNKNOWN-0001",
                status="mystery_state",
                assigned_tech_id=tech.id,
            )
            db.add(job)
            db.commit()

        tech_token_res = self.client.post(
            "/auth/dev/technician-token",
            json={"email": "unknown-tech@example.com", "password": "tech123"},
        )
        self.assertEqual(tech_token_res.status_code, 200, tech_token_res.text)
        tech_header = {"Authorization": f"Bearer {tech_token_res.json()['access_token']}"}

        feed_res = self.client.get("/technicians/me/jobs-feed", headers=tech_header)
        self.assertEqual(feed_res.status_code, 200, feed_res.text)
        body = feed_res.json()
        self.assertEqual(len(body["my_jobs"]), 1)
        self.assertEqual(body["my_jobs"][0]["job_code"], "SM2-UNKNOWN-0001")
        self.assertEqual(body["my_jobs"][0]["status"], "UNKNOWN")

    def test_technician_feed_uses_canonical_status_only(self):
        with SessionLocal() as db:
            tech = Technician(name="Canonical Tech", email="canonical-tech@example.com", status="active", password="tech123")
            db.add(tech)
            db.flush()
            db.add(Job(job_code="SM2-CANON-0001", status="scheduled", assigned_tech_id=tech.id))
            db.add(Job(job_code="SM2-CANON-0002", status="IN_PROGRESS", assigned_tech_id=tech.id))
            db.add(Job(job_code="SM2-CANON-0003", status="completed", assigned_tech_id=tech.id))
            db.add(Job(job_code="SM2-CANON-0004", status="pending_admin_confirmation", assigned_tech_id=tech.id))
            db.add(Job(job_code="SM2-CANON-0005", status="admin_review", assigned_tech_id=tech.id))
            db.commit()

        tech_token_res = self.client.post(
            "/auth/dev/technician-token",
            json={"email": "canonical-tech@example.com", "password": "tech123"},
        )
        self.assertEqual(tech_token_res.status_code, 200, tech_token_res.text)
        tech_header = {"Authorization": f"Bearer {tech_token_res.json()['access_token']}"}

        feed_res = self.client.get("/technicians/me/jobs-feed", headers=tech_header)
        self.assertEqual(feed_res.status_code, 200, feed_res.text)
        body = feed_res.json()

        canonical_statuses = {
            "UNKNOWN",
            "ADMIN_PREVIEW",
            "READY_FOR_TECH",
            "PENDING_ADMIN_CONFIRMATION",
            "PENDING_REVIEW",
            "PENDING",
            "SCHEDULED",
            "IN_PROGRESS",
            "DELAYED",
            "COMPLETED",
            "CANCELLED",
        }

        statuses = [item["status"] for item in body["my_jobs"] + body["available_jobs"]]
        self.assertGreaterEqual(len(statuses), 3)
        self.assertTrue(all(status in canonical_statuses for status in statuses))
        self.assertNotIn("pending_admin_confirmation", statuses)
        self.assertNotIn("admin_review", statuses)

    def test_technician_feed_falls_back_to_dealership_city_for_zone_name(self):
        with SessionLocal() as db:
            dealership = Dealership(code="D-LEVIS", name="Audi Levis", city="Levis", status="active")
            db.add(dealership)
            db.flush()

            tech = Technician(name="Zone Fallback", email="zone-fallback@example.com", status="active", password="tech123")
            db.add(tech)
            db.flush()

            db.add(
                Job(
                    job_code="SM2-ZONE-FALLBACK-0001",
                    status="scheduled",
                    assigned_tech_id=tech.id,
                    dealership_id=dealership.id,
                    zone_id=None,
                    location=None,
                )
            )
            db.commit()

        tech_token_res = self.client.post(
            "/auth/dev/technician-token",
            json={"email": "zone-fallback@example.com", "password": "tech123"},
        )
        self.assertEqual(tech_token_res.status_code, 200, tech_token_res.text)
        tech_header = {"Authorization": f"Bearer {tech_token_res.json()['access_token']}"}

        feed_res = self.client.get("/technicians/me/jobs-feed", headers=tech_header)
        self.assertEqual(feed_res.status_code, 200, feed_res.text)
        body = feed_res.json()
        self.assertEqual(len(body["my_jobs"]), 1)
        self.assertEqual(body["my_jobs"][0]["zone_name"], "Levis")

    def test_admin_sync_location_persists_from_dealership_city(self):
        create_res = self.client.post("/integrations/make/jobs", json=self._make_payload())
        self.assertEqual(create_res.status_code, 201, create_res.text)

        token_response = self.client.post("/auth/dev/admin-token", json=self.ADMIN_TOKEN_PAYLOAD)
        self.assertEqual(token_response.status_code, 200, token_response.text)
        auth_header = {"Authorization": f"Bearer {token_response.json()['access_token']}"}

        list_res = self.client.get("/admin/jobs", headers=auth_header)
        self.assertEqual(list_res.status_code, 200, list_res.text)
        job_id = list_res.json()[0]["id"]

        with SessionLocal() as db:
            job = db.query(Job).filter(Job.id == UUID(job_id)).first()
            self.assertIsNotNone(job)
            dealership = db.query(Dealership).filter(Dealership.id == job.dealership_id).first()
            self.assertIsNotNone(dealership)
            dealership.city = "Levis"
            db.commit()

        sync_res = self.client.post(f"/admin/jobs/{job_id}/sync-location", headers=auth_header)
        self.assertEqual(sync_res.status_code, 200, sync_res.text)

        # Idempotency: repeated sync should remain stable.
        sync_res_again = self.client.post(f"/admin/jobs/{job_id}/sync-location", headers=auth_header)
        self.assertEqual(sync_res_again.status_code, 200, sync_res_again.text)

        with SessionLocal() as db:
            job = db.query(Job).filter(Job.id == UUID(job_id)).first()
            self.assertIsNotNone(job)
            self.assertEqual(job.location, "Levis")

    def test_technician_feed_infers_city_from_dealership_name_when_city_missing(self):
        with SessionLocal() as db:
            dealership = Dealership(code="D-AUDI-LEVIS", name="Audi Levis", city=None, status="active")
            db.add(dealership)
            db.flush()

            tech = Technician(name="Infer City Tech", email="infer-city-tech@example.com", status="active", password="tech123")
            db.add(tech)
            db.flush()

            db.add(
                Job(
                    job_code="SM2-ZONE-INFER-0001",
                    status="scheduled",
                    assigned_tech_id=tech.id,
                    dealership_id=dealership.id,
                    zone_id=None,
                    location=None,
                )
            )
            db.commit()

        tech_token_res = self.client.post(
            "/auth/dev/technician-token",
            json={"email": "infer-city-tech@example.com", "password": "tech123"},
        )
        self.assertEqual(tech_token_res.status_code, 200, tech_token_res.text)
        tech_header = {"Authorization": f"Bearer {tech_token_res.json()['access_token']}"}

        feed_res = self.client.get("/technicians/me/jobs-feed", headers=tech_header)
        self.assertEqual(feed_res.status_code, 200, feed_res.text)
        body = feed_res.json()
        self.assertEqual(len(body["my_jobs"]), 1)
        self.assertEqual(body["my_jobs"][0]["zone_name"], "Levis")

    def test_make_intake_suggests_tech_but_keeps_admin_review_until_confirm(self):
        with SessionLocal() as db:
            skill = db.query(Skill).filter(Skill.name == "PPF").first()
            if skill is None:
                skill = Skill(name="PPF")
                db.add(skill)
                db.flush()

            zone = db.query(Zone).filter(Zone.name == "Quebec").first()
            if zone is None:
                zone = Zone(name="Quebec")
                db.add(zone)
                db.flush()

            tech = Technician(name="Auto Suggest Tech", email="auto-suggest-tech@example.com", status="active")
            db.add(tech)
            db.flush()

            db.execute(technician_skills.insert().values(technician_id=tech.id, skill_id=skill.id))
            db.execute(technician_zones.insert().values(technician_id=tech.id, zone_id=zone.id))
            db.commit()
            tech_id = str(tech.id)

        payload = [
            {
                "job_id": "SM2-20259999-0001",
                "dealership": {
                    "dealership_name": "Audi De Quebec",
                    "service": "PPF",
                },
                "vehicle": "audi a1 2023",
                "vehicle_number": "26053",
                "date": "2026-01-20",
                "time": "10:30",
                "urgent": True,
                "confidence": 84,
                "flags": ["AUDI"],
                "raw": "",
            }
        ]
        create_res = self.client.post("/integrations/make/jobs", json=payload)
        self.assertEqual(create_res.status_code, 201, create_res.text)
        body = create_res.json()
        self.assertEqual(body["created"], 1)
        self.assertEqual(body["items"][0]["status"], "admin_review")

        token_response = self.client.post("/auth/dev/admin-token", json=self.ADMIN_TOKEN_PAYLOAD)
        self.assertEqual(token_response.status_code, 200, token_response.text)
        auth_header = {"Authorization": f"Bearer {token_response.json()['access_token']}"}

        jobs_res = self.client.get("/admin/jobs", headers=auth_header)
        self.assertEqual(jobs_res.status_code, 200, jobs_res.text)
        job = next((row for row in jobs_res.json() if row["job_code"] == "SM2-20259999-0001"), None)
        self.assertIsNotNone(job)
        self.assertEqual(job["status"], "ADMIN_PREVIEW")
        self.assertIsNone(job["assigned_technician_id"])
        self.assertEqual(job["pre_assigned_technician_id"], tech_id)


if __name__ == "__main__":
    unittest.main()
