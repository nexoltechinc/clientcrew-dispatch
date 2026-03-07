import os
import unittest
from datetime import date, time

from sqlalchemy import insert

_TEST_DB_FILE = os.path.join(os.path.dirname(__file__), "pre_assignment_test.sqlite3")
if os.path.exists(_TEST_DB_FILE):
    os.remove(_TEST_DB_FILE)

os.environ["APP_ENV"] = "development"
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DB_FILE.replace(os.sep, '/')}"

from app.api.deps import SessionLocal, engine
from app.models.base import Base
from app.models.job import Job
from app.models.job_event import JobEvent
from app.models.skill import Skill, technician_skills
from app.models.technician import Technician
from app.models.time_off import TimeOff
from app.models.working_hours import WorkingHours
from app.models.zone import Zone, technician_zones
from app.services.pre_assignment_service import PreAssignmentService


class PreAssignmentServiceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)

    @classmethod
    def tearDownClass(cls):
        engine.dispose()
        if os.path.exists(_TEST_DB_FILE):
            os.remove(_TEST_DB_FILE)

    def setUp(self):
        with SessionLocal() as db:
            db.query(JobEvent).delete()
            db.query(Job).delete()
            db.query(TimeOff).delete()
            db.query(WorkingHours).delete()
            db.execute(technician_skills.delete())
            db.execute(technician_zones.delete())
            db.query(Technician).delete()
            db.query(Skill).delete()
            db.query(Zone).delete()
            db.commit()

    def _create_skill_zone(self, db):
        skill = Skill(name="Remote starters")
        zone = Zone(name="Quebec")
        db.add(skill)
        db.add(zone)
        db.flush()
        return skill, zone

    def _create_tech(self, db, *, name: str, email: str, status: str = "active", priority_rank: int = 100):
        tech = Technician(
            name=name,
            email=email,
            status=status,
            manual_availability=True,
            priority_rank=priority_rank,
        )
        db.add(tech)
        db.flush()
        return tech

    def _link_skill_zone(self, db, tech_id, skill_id, zone_id):
        db.execute(insert(technician_skills).values(technician_id=tech_id, skill_id=skill_id))
        db.execute(insert(technician_zones).values(technician_id=tech_id, zone_id=zone_id))

    def _enable_working_day(self, db, tech_id, *, day_of_week: int, start_at: time):
        db.add(
            WorkingHours(
                technician_id=tech_id,
                day_of_week=day_of_week,
                is_enabled=True,
                start_time=start_at,
                end_time=time(17, 0),
            )
        )

    def test_pre_assign_selects_eligible_and_writes_event(self):
        with SessionLocal() as db:
            skill, zone = self._create_skill_zone(db)
            tech_selected = self._create_tech(db, name="Dany", email="dany@example.com", priority_rank=20)
            tech_overlap = self._create_tech(db, name="Maxime", email="maxime@example.com", priority_rank=1)
            self._link_skill_zone(db, tech_selected.id, skill.id, zone.id)
            self._link_skill_zone(db, tech_overlap.id, skill.id, zone.id)
            self._enable_working_day(db, tech_selected.id, day_of_week=2, start_at=time(8, 0))
            self._enable_working_day(db, tech_overlap.id, day_of_week=2, start_at=time(8, 0))

            target_job = Job(
                job_code="SM2-PRE-001",
                status=PreAssignmentService.READY_FOR_TECH,
                skill_id=skill.id,
                zone_id=zone.id,
                requested_service_date=date(2026, 3, 4),
                requested_service_time=time(9, 0),
            )
            db.add(target_job)
            db.flush()
            db.add(
                Job(
                    job_code="SM2-BLOCK-001",
                    status="scheduled",
                    assigned_tech_id=tech_overlap.id,
                    skill_id=skill.id,
                    zone_id=zone.id,
                    requested_service_date=date(2026, 3, 4),
                    requested_service_time=time(9, 0),
                )
            )
            db.commit()

            updated = PreAssignmentService(db).pre_assign_technician(target_job.id)
            self.assertEqual(updated.status, PreAssignmentService.PENDING_ADMIN_CONFIRMATION)
            self.assertEqual(updated.pre_assigned_technician_id, tech_selected.id)
            self.assertIsNone(updated.assigned_tech_id)

            events = db.query(JobEvent).filter(JobEvent.job_id == target_job.id).all()
            self.assertEqual(len(events), 1)
            self.assertEqual(events[0].event_type, "TECH_PRE_ASSIGNED")
            self.assertEqual(events[0].actor_type, "SYSTEM")
            self.assertEqual(events[0].payload_json["selected_technician_id"], str(tech_selected.id))

    def test_pre_assign_no_eligible_sets_pending_review(self):
        with SessionLocal() as db:
            skill, zone = self._create_skill_zone(db)
            target_job = Job(
                job_code="SM2-PRE-002",
                status=PreAssignmentService.READY_FOR_TECH,
                skill_id=skill.id,
                zone_id=zone.id,
                requested_service_date=date(2026, 3, 5),
                requested_service_time=time(10, 0),
            )
            db.add(target_job)
            db.commit()

            updated = PreAssignmentService(db).pre_assign_technician(target_job.id)
            self.assertEqual(updated.status, PreAssignmentService.PENDING_REVIEW)
            self.assertEqual(updated.pre_assignment_reason, PreAssignmentService.NO_ELIGIBLE_TECHNICIAN)
            self.assertIsNone(updated.pre_assigned_technician_id)

            events = db.query(JobEvent).filter(JobEvent.job_id == target_job.id).all()
            self.assertEqual(len(events), 1)
            self.assertEqual(events[0].payload_json["selection_reason"], PreAssignmentService.NO_ELIGIBLE_TECHNICIAN)

    def test_pre_assign_is_idempotent(self):
        with SessionLocal() as db:
            skill, zone = self._create_skill_zone(db)
            tech = self._create_tech(db, name="Victor", email="victor@example.com", priority_rank=10)
            self._link_skill_zone(db, tech.id, skill.id, zone.id)
            self._enable_working_day(db, tech.id, day_of_week=3, start_at=time(8, 0))
            target_job = Job(
                job_code="SM2-PRE-003",
                status=PreAssignmentService.READY_FOR_TECH,
                skill_id=skill.id,
                zone_id=zone.id,
                requested_service_date=date(2026, 3, 5),
                requested_service_time=time(9, 0),
            )
            db.add(target_job)
            db.commit()

            first = PreAssignmentService(db).pre_assign_technician(target_job.id)
            second = PreAssignmentService(db).pre_assign_technician(target_job.id)
            self.assertEqual(first.pre_assigned_technician_id, second.pre_assigned_technician_id)
            self.assertEqual(second.status, PreAssignmentService.PENDING_ADMIN_CONFIRMATION)

            events = db.query(JobEvent).filter(JobEvent.job_id == target_job.id).all()
            self.assertEqual(len(events), 1)

    def test_pre_assign_honors_exclusive_technician(self):
        with SessionLocal() as db:
            skill, zone = self._create_skill_zone(db)
            tech_a = self._create_tech(db, name="Jolianne", email="jolianne@example.com", priority_rank=1)
            tech_b = self._create_tech(db, name="Dany", email="dany2@example.com", priority_rank=100)
            self._link_skill_zone(db, tech_a.id, skill.id, zone.id)
            self._link_skill_zone(db, tech_b.id, skill.id, zone.id)
            self._enable_working_day(db, tech_a.id, day_of_week=4, start_at=time(8, 0))
            self._enable_working_day(db, tech_b.id, day_of_week=4, start_at=time(8, 0))
            target_job = Job(
                job_code="SM2-PRE-004",
                status=PreAssignmentService.READY_FOR_TECH,
                skill_id=skill.id,
                zone_id=zone.id,
                requested_service_date=date(2026, 3, 6),
                requested_service_time=time(11, 0),
                source_metadata={"exclusive_technician_id": str(tech_b.id)},
            )
            db.add(target_job)
            db.commit()

            updated = PreAssignmentService(db).pre_assign_technician(target_job.id)
            self.assertEqual(updated.pre_assigned_technician_id, tech_b.id)
            event = db.query(JobEvent).filter(JobEvent.job_id == target_job.id).first()
            self.assertEqual(event.payload_json["selection_reason"], "exclusive_technician")


if __name__ == "__main__":
    unittest.main()
