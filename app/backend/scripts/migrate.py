import argparse
import pathlib
import sys
from dataclasses import dataclass
from datetime import datetime, time, timezone
from typing import Iterable

from sqlalchemy import and_, create_engine, insert, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

SCRIPT_DIR = pathlib.Path(__file__).resolve().parent
BACKEND_ROOT = SCRIPT_DIR.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.config import DATABASE_URL
from app.models import Job, JobService, Skill, Technician, WorkingHours, Zone, technician_skills, technician_zones
from app.models.base import Base


@dataclass(frozen=True)
class Migration:
    filename: str
    seed: bool = False


MIGRATIONS: list[Migration] = [
    Migration("001_technician_module.sql"),
    Migration("002_admin_technician_profile.sql"),
    Migration("003_technician.sql", seed=True),
    Migration("004_dealerships.sql"),
    Migration("005_normalize_zone_names.sql"),
    Migration("006_technician_signup_requests.sql"),
    Migration("007_invoices.sql"),
    Migration("008_dispatch_job_invoice_fields.sql"),
    Migration("009_technician_profile_email_change_requests.sql"),
    Migration("010_job_services.sql"),
    Migration("011_quickbooks_service_catalog.sql"),
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run SM2 backend schema migrations")
    parser.add_argument(
        "--with-seed",
        action="store_true",
        help="also run development seed migrations (e.g. 003_technician.sql)",
    )
    return parser.parse_args()


def get_engine():
    is_sqlite = DATABASE_URL.startswith("sqlite")
    return create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False} if is_sqlite else {},
        pool_pre_ping=not is_sqlite,
    )


def ensure_migration_table(conn) -> None:
    conn.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version TEXT PRIMARY KEY,
                applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
    )


def load_applied_versions(conn) -> set[str]:
    rows = conn.execute(text("SELECT version FROM schema_migrations")).all()
    return {row[0] for row in rows}


def mark_versions_applied(conn, versions: Iterable[str]) -> None:
    now = datetime.now(timezone.utc).isoformat()
    for version in versions:
        try:
            conn.execute(
                text(
                    """
                    INSERT INTO schema_migrations (version, applied_at)
                    VALUES (:version, :applied_at)
                    """
                ),
                {"version": version, "applied_at": now},
            )
        except IntegrityError:
            # Idempotent behavior across SQLite/PostgreSQL if the version is already present.
            continue


def ensure_sqlite_technician_password_column(conn) -> None:
    def ensure_column(table_name: str, column_name: str, ddl: str) -> None:
        if DATABASE_URL.startswith("sqlite"):
            columns = {
                row[1]
                for row in conn.exec_driver_sql(f"PRAGMA table_info('{table_name}')").fetchall()
            }
            if columns and column_name not in columns:
                conn.exec_driver_sql(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {ddl}")
            return

        columns = {
            row[0]
            for row in conn.execute(
                text(
                    """
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_name = :table_name
                    """
                ),
                {"table_name": table_name},
            ).fetchall()
        }
        if columns and column_name not in columns:
            conn.exec_driver_sql(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {ddl}")

    ensure_column("technicians", "password", "VARCHAR(255)")
    ensure_column("technicians", "full_name", "VARCHAR(255)")
    ensure_column("technicians", "profile_picture_url", "TEXT")
    ensure_column("technicians", "working_days", "TEXT DEFAULT '[]' NOT NULL")
    ensure_column("technicians", "working_hours_start", "TIME")
    ensure_column("technicians", "working_hours_end", "TIME")
    ensure_column("technicians", "after_hours_enabled", "BOOLEAN DEFAULT 0 NOT NULL")
    ensure_column("technicians", "updated_by", "CHAR(32)")
    ensure_column("technicians", "priority_rank", "INTEGER DEFAULT 100 NOT NULL")
    ensure_column("jobs", "dealership_id", "CHAR(32)")
    ensure_column("jobs", "customer_name", "VARCHAR(255)")
    ensure_column("jobs", "customer_address", "TEXT")
    ensure_column("jobs", "customer_city", "VARCHAR(128)")
    ensure_column("jobs", "customer_state", "VARCHAR(128)")
    ensure_column("jobs", "customer_zip_code", "VARCHAR(32)")
    ensure_column("jobs", "ship_to_name", "VARCHAR(255)")
    ensure_column("jobs", "ship_to_address", "TEXT")
    ensure_column("jobs", "ship_to_city", "VARCHAR(128)")
    ensure_column("jobs", "ship_to_state", "VARCHAR(128)")
    ensure_column("jobs", "ship_to_zip_code", "VARCHAR(32)")
    ensure_column("jobs", "service_type", "VARCHAR(255)")
    ensure_column("jobs", "hours_worked", "NUMERIC(10,2)")
    ensure_column("jobs", "rate", "NUMERIC(12,2)")
    ensure_column("jobs", "location", "TEXT")
    ensure_column("jobs", "vehicle", "VARCHAR(255)")
    ensure_column("jobs", "tax_code", "VARCHAR(32)")
    ensure_column("jobs", "tax_rate", "NUMERIC(8,5)")
    ensure_column("jobs", "completed_at", "DATETIME")
    ensure_column("jobs", "invoice_id", "CHAR(32)")
    ensure_column("jobs", "requested_service_date", "DATE")
    ensure_column("jobs", "requested_service_time", "TIME")
    ensure_column("jobs", "source_system", "VARCHAR(32)")
    ensure_column("jobs", "source_metadata", "TEXT")
    ensure_column("jobs", "pre_assigned_technician_id", "CHAR(32)")
    ensure_column("jobs", "pre_assignment_reason", "VARCHAR(64)")
    ensure_column("job_services", "quantity", "NUMERIC(10,2) DEFAULT 1 NOT NULL")
    ensure_column("job_services", "unit_price", "NUMERIC(12,2) DEFAULT 0 NOT NULL")
    ensure_column("invoices", "approval_note", "TEXT")
    ensure_column("invoice_line_items", "qb_item_id", "VARCHAR(64)")
    ensure_column("service_catalog", "qb_item_id", "VARCHAR(64)")
    ensure_column("service_catalog", "sku", "VARCHAR(128)")
    ensure_column("service_catalog", "description", "TEXT")
    ensure_column("service_catalog", "qb_type", "VARCHAR(64)")


def backfill_job_services(engine) -> None:
    with Session(engine) as session:
        rows = session.query(Job).all()
        changed = False

        for job in rows:
            existing_services = [
                row
                for row in session.query(JobService).filter(JobService.job_id == job.id).order_by(JobService.sort_order.asc()).all()
            ]
            if existing_services:
                primary = existing_services[0].service_name_snapshot.strip()
                if primary and job.service_type != primary:
                    job.service_type = primary
                    changed = True
                continue

            service_name = (job.service_type or "").strip()
            if not service_name:
                continue

            session.add(
                JobService(
                    job_id=job.id,
                    service_name_snapshot=service_name,
                    source="dealership",
                    sort_order=0,
                )
            )
            changed = True

        if changed:
            session.commit()


def seed_development_data(engine) -> None:
    with Session(engine) as session:
        zone_names = ["Quebec", "Levis", "Donnacona", "St-Raymond"]
        skill_names = [
            "PPF",
            "Window Tint",
            "Windshield replacement",
            "Windshield repair",
            "Remote starters",
            "Vehicle tracking systems",
            "Engine immobilizers",
        ]

        technicians = [
            {"name": "Jolianne", "email": "jolianne@sm2dispatch.com", "phone": "418-896-1296"},
            {"name": "Victor", "email": "victor@sm2dispatch.com", "phone": None},
            {"name": "Maxime", "email": "maxime@sm2dispatch.com", "phone": None},
            {"name": "Dany", "email": "dany@sm2dispatch.com", "phone": "418-806-3649"},
        ]

        zone_assignments = [
            ("jolianne@sm2dispatch.com", "Quebec"),
            ("jolianne@sm2dispatch.com", "Levis"),
            ("jolianne@sm2dispatch.com", "Donnacona"),
            ("jolianne@sm2dispatch.com", "St-Raymond"),
            ("victor@sm2dispatch.com", "Donnacona"),
            ("victor@sm2dispatch.com", "St-Raymond"),
            ("victor@sm2dispatch.com", "Quebec"),
            ("victor@sm2dispatch.com", "Levis"),
            ("maxime@sm2dispatch.com", "Donnacona"),
            ("maxime@sm2dispatch.com", "St-Raymond"),
            ("maxime@sm2dispatch.com", "Quebec"),
            ("maxime@sm2dispatch.com", "Levis"),
            ("dany@sm2dispatch.com", "Quebec"),
        ]

        skill_assignments = [
            ("jolianne@sm2dispatch.com", "PPF"),
            ("victor@sm2dispatch.com", "PPF"),
            ("victor@sm2dispatch.com", "Window Tint"),
            ("maxime@sm2dispatch.com", "PPF"),
            ("maxime@sm2dispatch.com", "Window Tint"),
            ("dany@sm2dispatch.com", "Windshield replacement"),
            ("dany@sm2dispatch.com", "Windshield repair"),
            ("dany@sm2dispatch.com", "Remote starters"),
            ("dany@sm2dispatch.com", "Vehicle tracking systems"),
            ("dany@sm2dispatch.com", "Engine immobilizers"),
        ]

        schedule = [
            (0, False, time(9, 0), time(17, 0)),
            (1, True, time(8, 0), time(17, 0)),
            (2, True, time(8, 0), time(17, 0)),
            (3, True, time(8, 0), time(17, 0)),
            (4, True, time(8, 0), time(17, 0)),
            (5, True, time(8, 0), time(15, 0)),
            (6, False, time(9, 0), time(17, 0)),
        ]

        for zone_name in zone_names:
            if session.query(Zone.id).filter(Zone.name == zone_name).first() is None:
                session.add(Zone(name=zone_name))

        for skill_name in skill_names:
            if session.query(Skill.id).filter(Skill.name == skill_name).first() is None:
                session.add(Skill(name=skill_name))

        session.flush()

        for row in technicians:
            existing = session.query(Technician).filter(Technician.email == row["email"]).first()
            if existing is None:
                session.add(
                    Technician(
                        name=row["name"],
                        email=row["email"],
                        phone=row["phone"],
                        status="active",
                        manual_availability=True,
                    )
                )
            else:
                existing.name = row["name"]
                existing.phone = row["phone"]
                existing.status = "active"
                existing.manual_availability = True

        session.flush()

        for tech_email, zone_name in zone_assignments:
            tech_row = session.query(Technician.id).filter(Technician.email == tech_email).first()
            zone_row = session.query(Zone.id).filter(Zone.name == zone_name).first()
            if tech_row is None or zone_row is None:
                continue

            exists = session.execute(
                select(technician_zones.c.technician_id).where(
                    and_(
                        technician_zones.c.technician_id == tech_row[0],
                        technician_zones.c.zone_id == zone_row[0],
                    )
                )
            ).first()
            if exists is None:
                session.execute(
                    insert(technician_zones).values(
                        technician_id=tech_row[0],
                        zone_id=zone_row[0],
                    )
                )

        for tech_email, skill_name in skill_assignments:
            tech_row = session.query(Technician.id).filter(Technician.email == tech_email).first()
            skill_row = session.query(Skill.id).filter(Skill.name == skill_name).first()
            if tech_row is None or skill_row is None:
                continue

            exists = session.execute(
                select(technician_skills.c.technician_id).where(
                    and_(
                        technician_skills.c.technician_id == tech_row[0],
                        technician_skills.c.skill_id == skill_row[0],
                    )
                )
            ).first()
            if exists is None:
                session.execute(
                    insert(technician_skills).values(
                        technician_id=tech_row[0],
                        skill_id=skill_row[0],
                    )
                )

        seeded_tech_emails = [row["email"] for row in technicians]
        seeded_tech_ids = session.execute(
            select(Technician.id).where(Technician.email.in_(seeded_tech_emails))
        ).all()

        for tech_id, in seeded_tech_ids:
            for day_of_week, is_enabled, start_time, end_time in schedule:
                row = (
                    session.query(WorkingHours)
                    .filter(
                        WorkingHours.technician_id == tech_id,
                        WorkingHours.day_of_week == day_of_week,
                    )
                    .first()
                )
                if row is None:
                    session.add(
                        WorkingHours(
                            technician_id=tech_id,
                            day_of_week=day_of_week,
                            is_enabled=is_enabled,
                            start_time=start_time,
                            end_time=end_time,
                        )
                    )
                else:
                    row.is_enabled = is_enabled
                    row.start_time = start_time
                    row.end_time = end_time

        session.commit()


def run() -> None:
    args = parse_args()
    selected = [m for m in MIGRATIONS if args.with_seed or not m.seed]
    selected_versions = [m.filename for m in selected]

    engine = get_engine()
    with engine.begin() as conn:
        ensure_migration_table(conn)
        applied = load_applied_versions(conn)
        Base.metadata.create_all(bind=conn)
        ensure_sqlite_technician_password_column(conn)

    pending = [version for version in selected_versions if version not in applied]
    for version in selected_versions:
        if version in applied:
            print(f"SKIP {version} (already applied)")
        else:
            print(f"APPLY {version}")

    if args.with_seed and "003_technician.sql" in pending:
        seed_development_data(engine)

    backfill_job_services(engine)

    with engine.begin() as conn:
        ensure_migration_table(conn)
        mark_versions_applied(conn, pending)

    for version in pending:
        print(f"DONE  {version}")


if __name__ == "__main__":
    run()
