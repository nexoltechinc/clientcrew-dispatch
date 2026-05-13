import argparse
import pathlib
import sys
from dataclasses import dataclass
from datetime import date, datetime, time, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Iterable

from sqlalchemy import and_, create_engine, insert, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

SCRIPT_DIR = pathlib.Path(__file__).resolve().parent
BACKEND_ROOT = SCRIPT_DIR.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.config import COMPANY_CITY, COMPANY_EMAIL, COMPANY_NAME, COMPANY_PHONE, COMPANY_STATE, COMPANY_STREET_ADDRESS, COMPANY_WEBSITE, COMPANY_ZIP_CODE, DATABASE_URL
from app.core.job_status import DispatchJobStatus, db_status_from_dispatch_status
from app.models import Dealership, Invoice, InvoiceLineItem, Job, JobService, Skill, Technician, WorkingHours, Zone, technician_skills, technician_zones
from app.models.base import Base
from app.services.job_services_service import JobServicesService
from app.services.service_catalog_service import ServiceCatalogService


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
    parser = argparse.ArgumentParser(description="Run DispatchIQ backend schema migrations")
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


def _money(value: Decimal | int | float | str) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _tax_amount(amount: Decimal, rate: Decimal) -> Decimal:
    return _money(amount * rate)


def seed_development_data(engine) -> None:
    with Session(engine) as session:
        # Seed the service catalog first so demo jobs can resolve catalog ids and prices.
        ServiceCatalogService(session).list_admin_services()

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
            {"name": "Taylor Brooks", "email": "jolianne@dispatchiq.test", "phone": "418-896-1296", "password": "tech123"},
            {"name": "Jordan Lee", "email": "victor@dispatchiq.test", "phone": None, "password": "tech123"},
            {"name": "Casey Patel", "email": "maxime@dispatchiq.test", "phone": None, "password": "tech123"},
            {"name": "Riley Carter", "email": "dany@dispatchiq.test", "phone": "418-806-3649", "password": "tech123"},
            {
                "name": "Alex Morgan",
                "email": "tech@dispatchiq.test",
                "phone": "+1 (555) 234-5678",
                "password": "tech123",
            },
        ]

        zone_assignments = [
            ("jolianne@dispatchiq.test", "Quebec"),
            ("jolianne@dispatchiq.test", "Levis"),
            ("jolianne@dispatchiq.test", "Donnacona"),
            ("jolianne@dispatchiq.test", "St-Raymond"),
            ("victor@dispatchiq.test", "Donnacona"),
            ("victor@dispatchiq.test", "St-Raymond"),
            ("victor@dispatchiq.test", "Quebec"),
            ("victor@dispatchiq.test", "Levis"),
            ("maxime@dispatchiq.test", "Donnacona"),
            ("maxime@dispatchiq.test", "St-Raymond"),
            ("maxime@dispatchiq.test", "Quebec"),
            ("maxime@dispatchiq.test", "Levis"),
            ("dany@dispatchiq.test", "Quebec"),
            ("tech@dispatchiq.test", "Quebec"),
            ("tech@dispatchiq.test", "Levis"),
            ("tech@dispatchiq.test", "Donnacona"),
            ("tech@dispatchiq.test", "St-Raymond"),
        ]

        skill_assignments = [
            ("jolianne@dispatchiq.test", "PPF"),
            ("victor@dispatchiq.test", "PPF"),
            ("victor@dispatchiq.test", "Window Tint"),
            ("maxime@dispatchiq.test", "PPF"),
            ("maxime@dispatchiq.test", "Window Tint"),
            ("dany@dispatchiq.test", "Windshield replacement"),
            ("dany@dispatchiq.test", "Windshield repair"),
            ("dany@dispatchiq.test", "Remote starters"),
            ("dany@dispatchiq.test", "Vehicle tracking systems"),
            ("dany@dispatchiq.test", "Engine immobilizers"),
            ("tech@dispatchiq.test", "PPF"),
            ("tech@dispatchiq.test", "Window Tint"),
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

        dealerships = [
            {
                "code": "D-101",
                "name": "Northwind Auto",
                "phone": "581-705-8089",
                "email": "comptabilite@audidequebec.com",
                "address": "5200 rue John Molson",
                "city": "Quebec",
                "postal_code": "G1X 3X4",
            },
            {
                "code": "D-102",
                "name": "Summit Motors",
                "phone": "(418) 285-0970",
                "email": "dthibault@germainnissan.ca",
                "address": "104 rue commerciale",
                "city": "Donnacona",
                "postal_code": "G3M 1W1",
            },
            {
                "code": "D-103",
                "name": "Harbor Toyota",
                "phone": "",
                "email": "",
                "address": "565 Cote Joyeuse",
                "city": "St-Raymond",
                "postal_code": "G3L 4B2",
            },
            {
                "code": "D-104",
                "name": "L'Expert Carrossier Rive-Sud",
                "phone": "",
                "email": "magasinierauto@corrossier.expert",
                "address": "250 Av. Taniata",
                "city": "Levis",
                "postal_code": "G6W 5M6",
            },
        ]

        demo_jobs = [
            {
                "job_code": "DIQ-DEMO-1001",
                "dispatch_status": DispatchJobStatus.IN_PROGRESS,
                "dealership_code": "D-101",
                "service_names": ["Full Fender Protection (2 panels)", "Front Window Tint"],
                "vehicle": "2024 Audi Q5 Technik",
                "requested_service_date": date(2026, 4, 28),
                "requested_service_time": time(9, 30),
                "zone_name": "Quebec",
            },
            {
                "job_code": "DIQ-DEMO-1002",
                "dispatch_status": DispatchJobStatus.DELAYED,
                "dealership_code": "D-102",
                "service_names": ["Hood Protection Strip 18\"", "Roof Protection Strip 6\""],
                "vehicle": "2025 Nissan Rogue Platinum",
                "requested_service_date": date(2026, 4, 29),
                "requested_service_time": time(11, 0),
                "zone_name": "Donnacona",
            },
            {
                "job_code": "DIQ-DEMO-1003",
                "dispatch_status": DispatchJobStatus.PENDING,
                "dealership_code": "D-103",
                "service_names": ["Full Vehicle Tint"],
                "vehicle": "2024 Toyota Highlander Limited",
                "requested_service_date": date(2026, 4, 30),
                "requested_service_time": time(13, 30),
                "zone_name": "St-Raymond",
            },
            {
                "job_code": "DIQ-DEMO-1004",
                "dispatch_status": DispatchJobStatus.COMPLETED,
                "dealership_code": "D-104",
                "service_names": ["Rear Bumper Protection Strip"],
                "vehicle": "2023 Honda Civic Touring",
                "requested_service_date": date(2026, 4, 27),
                "requested_service_time": time(8, 45),
                "completed_at": datetime(2026, 4, 27, 16, 40, tzinfo=timezone.utc),
                "zone_name": "Levis",
            },
            {
                "job_code": "DIQ-DEMO-1005",
                "dispatch_status": DispatchJobStatus.COMPLETED,
                "dealership_code": "D-101",
                "service_names": ["Full Fender Protection (2 panels)", "Front Window Tint"],
                "vehicle": "2026 Audi Q7 Progress Edition",
                "requested_service_date": date(2026, 4, 28),
                "requested_service_time": time(15, 0),
                "completed_at": datetime(2026, 4, 28, 17, 10, tzinfo=timezone.utc),
                "zone_name": "Quebec",
                "invoice_number": "INV-1001",
                "payment_recorded_at": datetime(2026, 4, 28, 17, 35, tzinfo=timezone.utc),
            },
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
                        password=row["password"],
                        status="active",
                        manual_availability=True,
                    )
                )
            else:
                existing.name = row["name"]
                existing.phone = row["phone"]
                existing.status = "active"
                existing.manual_availability = True
                if not (existing.password or "").strip():
                    existing.password = row["password"]

        session.flush()

        for row in dealerships:
            existing = session.query(Dealership).filter(Dealership.code == row["code"]).first()
            if existing is None:
                session.add(
                    Dealership(
                        code=row["code"],
                        name=row["name"],
                        phone=row["phone"] or None,
                        email=row["email"] or None,
                        address=row["address"] or None,
                        city=row["city"] or None,
                        postal_code=row["postal_code"] or None,
                        status="active",
                    )
                )
            else:
                existing.name = row["name"]
                existing.phone = row["phone"] or None
                existing.email = row["email"] or None
                existing.address = row["address"] or None
                existing.city = row["city"] or None
                existing.postal_code = row["postal_code"] or None
                existing.status = "active"

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
        tech_rows = session.execute(
            select(Technician.id, Technician.email).where(Technician.email.in_(seeded_tech_emails))
        ).all()
        tech_ids_by_email = {email: tech_id for tech_id, email in tech_rows}

        dealership_rows = session.execute(
            select(Dealership.id, Dealership.code).where(Dealership.code.in_([row["code"] for row in dealerships]))
        ).all()
        dealership_ids_by_code = {code: dealership_id for dealership_id, code in dealership_rows}

        zone_rows = session.execute(
            select(Zone.id, Zone.name).where(Zone.name.in_(zone_names))
        ).all()
        zone_ids_by_name = {name: zone_id for zone_id, name in zone_rows}

        jobs_service = JobServicesService(session)
        for job in demo_jobs:
            technician_id = tech_ids_by_email.get("tech@dispatchiq.test")
            dealership_id = dealership_ids_by_code.get(job["dealership_code"])
            zone_id = zone_ids_by_name.get(job["zone_name"])
            dealership = next((row for row in dealerships if row["code"] == job["dealership_code"]), None)
            if technician_id is None or dealership_id is None or dealership is None:
                continue

            job_row = session.query(Job).filter(Job.job_code == job["job_code"]).first()
            if job_row is None:
                job_row = Job(job_code=job["job_code"])
                session.add(job_row)

            job_row.status = db_status_from_dispatch_status(job["dispatch_status"])
            job_row.assigned_tech_id = technician_id
            job_row.dealership_id = dealership_id
            job_row.zone_id = zone_id
            job_row.customer_name = dealership["name"]
            job_row.customer_address = dealership["address"] or None
            job_row.customer_city = dealership["city"] or None
            job_row.customer_state = "QC"
            job_row.customer_zip_code = dealership["postal_code"] or None
            job_row.ship_to_name = dealership["name"]
            job_row.ship_to_address = dealership["address"] or None
            job_row.ship_to_city = dealership["city"] or None
            job_row.ship_to_state = "QC"
            job_row.ship_to_zip_code = dealership["postal_code"] or None
            job_row.service_type = job["service_names"][0]
            job_row.vehicle = job["vehicle"]
            job_row.location = dealership["city"] or None
            job_row.requested_service_date = job["requested_service_date"]
            job_row.requested_service_time = job["requested_service_time"]
            job_row.completed_at = job.get("completed_at")
            job_row.source_system = "demo_seed"
            job_row.source_metadata = {
                "seed": True,
                "scenario": "crm_demo_jobs",
                "dealership_code": job["dealership_code"],
                "technician_email": "tech@dispatchiq.test",
                "service_names": job["service_names"],
            }

            session.flush()
            jobs_service.replace_services(
                job=job_row,
                service_names=job["service_names"],
                source="dealership",
                created_by_user_id=None,
            )

            invoice_number = job.get("invoice_number")
            if not invoice_number:
                continue

            service_rows = jobs_service.list_service_rows(job_row)
            if not service_rows:
                continue

            invoice_date = job["requested_service_date"]
            due_date = date.fromordinal(invoice_date.toordinal() + 15)
            tax_rate = Decimal("0.14975")
            invoice_status = "paid"
            bill_to_name = dealership["name"]
            bill_to_address = dealership["address"]
            bill_to_city = dealership["city"]
            bill_to_state = "QC"
            bill_to_zip_code = dealership["postal_code"]
            line_amounts: list[Decimal] = []
            line_tax_amounts: list[Decimal] = []

            invoice = session.query(Invoice).filter(Invoice.invoice_number == invoice_number).first()
            if invoice is None:
                invoice = Invoice(invoice_number=invoice_number)
                session.add(invoice)

            invoice.company_logo_url = None
            invoice.company_name = COMPANY_NAME
            invoice.company_street_address = COMPANY_STREET_ADDRESS
            invoice.company_city = COMPANY_CITY
            invoice.company_state = COMPANY_STATE
            invoice.company_zip_code = COMPANY_ZIP_CODE
            invoice.company_phone = COMPANY_PHONE
            invoice.company_email = COMPANY_EMAIL
            invoice.company_website = COMPANY_WEBSITE
            invoice.bill_to_name = bill_to_name
            invoice.bill_to_address = bill_to_address
            invoice.bill_to_city = bill_to_city
            invoice.bill_to_state = bill_to_state
            invoice.bill_to_zip_code = bill_to_zip_code
            invoice.ship_to_name = bill_to_name
            invoice.ship_to_address = bill_to_address
            invoice.ship_to_city = bill_to_city
            invoice.ship_to_state = bill_to_state
            invoice.ship_to_zip_code = bill_to_zip_code
            invoice.invoice_date = invoice_date
            invoice.terms = "NET_15"
            invoice.custom_term_days = None
            invoice.due_date = due_date
            invoice.shipping = Decimal("0.00")
            invoice.customer_message = "Sample CRM invoice seeded for demo visibility."
            invoice.approval_note = "Paid sample invoice linked to completed CRM demo job."
            invoice.status = invoice_status
            invoice.payment_recorded_at = job.get("payment_recorded_at")
            invoice.voided_at = None

            invoice.line_items.clear()
            for index, row in enumerate(service_rows):
                amount = _money(row.quantity * row.unit_price)
                line_tax_amount = _tax_amount(amount, tax_rate)
                line_amounts.append(amount)
                line_tax_amounts.append(line_tax_amount)
                invoice.line_items.append(
                    InvoiceLineItem(
                        job_id=job_row.id,
                        product_service=row.service_name_snapshot,
                        qb_item_id=None,
                        description=f"{job_row.job_code} | {job_row.vehicle} | {row.service_name_snapshot}",
                        quantity=_money(row.quantity),
                        rate=_money(row.unit_price),
                        amount=amount,
                        tax_code="GST_QST",
                        tax_rate=tax_rate,
                        tax_amount=line_tax_amount,
                        line_order=index,
                    )
                )

            invoice.subtotal = _money(sum(line_amounts, Decimal("0.00")))
            invoice.sales_tax = _money(sum(line_tax_amounts, Decimal("0.00")))
            invoice.total = _money(invoice.subtotal + invoice.sales_tax + invoice.shipping)
            job_row.invoice = invoice

        for tech_id, in session.execute(
            select(Technician.id).where(Technician.email.in_(seeded_tech_emails))
        ).all():
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

    if args.with_seed:
        seed_development_data(engine)

    backfill_job_services(engine)

    with engine.begin() as conn:
        ensure_migration_table(conn)
        mark_versions_applied(conn, pending)

    for version in pending:
        print(f"DONE  {version}")


if __name__ == "__main__":
    run()

