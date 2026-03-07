import os
import unittest
from datetime import date, timedelta
from decimal import Decimal
from uuid import uuid4

from fastapi.testclient import TestClient

_TEST_DB_FILE = os.path.join(os.path.dirname(__file__), "invoice_api_test.sqlite3")
if os.path.exists(_TEST_DB_FILE):
    os.remove(_TEST_DB_FILE)

os.environ["APP_ENV"] = "development"
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DB_FILE.replace(os.sep, '/')}"

from app.api.deps import SessionLocal, engine
from app.main import app
from app.models.base import Base
from app.models.dealership import Dealership
from app.models.invoice import Invoice, InvoiceLineItem
from app.models.invoice_branding_settings import InvoiceBrandingSettings
from app.models.job import Job
from app.models.job_service import JobService
from app.models.priority_rule import PriorityRule
from app.models.technician import Technician


class InvoiceApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)
        cls.client = TestClient(app)
        token_response = cls.client.post(
            "/auth/dev/admin-token",
            json={"email": "admin@sm2dispatch.com", "password": "admin123"},
        )
        assert token_response.status_code == 200
        cls.auth_header = {"Authorization": f"Bearer {token_response.json()['access_token']}"}

    @classmethod
    def tearDownClass(cls):
        engine.dispose()
        if os.path.exists(_TEST_DB_FILE):
            os.remove(_TEST_DB_FILE)

    def setUp(self):
        with SessionLocal() as db:
            db.query(InvoiceLineItem).delete()
            db.query(JobService).delete()
            db.query(Job).update({"invoice_id": None}, synchronize_session=False)
            db.query(Invoice).delete()
            db.query(InvoiceBrandingSettings).delete()
            db.query(PriorityRule).delete()
            db.query(Job).delete()
            db.query(Technician).delete()
            db.query(Dealership).delete()
            db.commit()

    def _seed_completed_job(self, *, code: str, dealership: Dealership, service: str, hours: Decimal, rate: Decimal) -> str:
        with SessionLocal() as db:
            row = Job(
                id=uuid4(),
                job_code=code,
                status="COMPLETED",
                dealership_id=dealership.id,
                customer_name=dealership.name,
                customer_address=dealership.address,
                customer_city=dealership.city,
                customer_state="QC",
                customer_zip_code=dealership.postal_code,
                service_type=service,
                hours_worked=hours,
                rate=rate,
                location="Quebec City",
                vehicle="2023 Ford F-150",
                tax_code="GST",
            )
            db.add(row)
            db.commit()
            return str(row.id)

    def _seed_dealership(self) -> Dealership:
        with SessionLocal() as db:
            row = Dealership(
                id=uuid4(),
                code="D-900",
                name="Audi de Quebec",
                phone="+1-418-555-2200",
                email="service@audidequebec.com",
                address="999 Grande Allee",
                city="Quebec",
                postal_code="G1R 2K4",
                status="active",
            )
            db.add(row)
            db.commit()
            db.refresh(row)
            return row

    def _seed_technician(self) -> Technician:
        with SessionLocal() as db:
            row = Technician(
                id=uuid4(),
                name="Jolianne",
                email="jolianne@sm2dispatch.com",
                phone="+1-418-555-0101",
                status="active",
            )
            db.add(row)
            db.commit()
            db.refresh(row)
            return row

    def test_invoice_crud_routes_with_dispatch_jobs(self):
        dealership = self._seed_dealership()
        job_1_id = self._seed_completed_job(
            code="SM2-2024-1001",
            dealership=dealership,
            service="Transponder Key Programming",
            hours=Decimal("2.00"),
            rate=Decimal("95.00"),
        )
        job_2_id = self._seed_completed_job(
            code="SM2-2024-1002",
            dealership=dealership,
            service="Service Call",
            hours=Decimal("1.00"),
            rate=Decimal("45.00"),
        )

        create_payload = {
            "dispatch_job_ids": [job_1_id, job_2_id],
            "terms": "NET_15",
            "shipping": "10.00",
            "status": "sent",
            "customer_message": "Thank you for choosing SM2 Dispatch.",
        }
        create_res = self.client.post("/invoices", json=create_payload, headers=self.auth_header)
        self.assertEqual(create_res.status_code, 201, create_res.text)
        created = create_res.json()
        self.assertEqual(created["invoice_number"], "INV-0001")
        self.assertEqual(created["subtotal"], "235.00")
        self.assertEqual(created["sales_tax"], "11.75")
        self.assertEqual(created["sales_tax_total"], "11.75")
        self.assertEqual(created["shipping"], "10.00")
        self.assertEqual(created["total"], "256.75")
        self.assertEqual(created["terms"], "NET_15")
        self.assertEqual(created["status"], "sent")
        self.assertEqual(len(created["line_items"]), 2)
        self.assertIn("company_info", created)
        self.assertIn("bill_to", created)
        self.assertEqual(created["line_items"][0]["qty"], created["line_items"][0]["quantity"])
        self.assertEqual(
            Decimal(created["total"]),
            Decimal(created["subtotal"]) + Decimal(created["sales_tax"]) + Decimal(created["shipping"]),
        )

        expected_due_date = (date.today() + timedelta(days=15)).isoformat()
        self.assertEqual(created["due_date"], expected_due_date)

        invoice_id = created["id"]
        get_res = self.client.get(f"/invoices/{invoice_id}", headers=self.auth_header)
        self.assertEqual(get_res.status_code, 200, get_res.text)
        self.assertEqual(get_res.json()["id"], invoice_id)

        update_payload = {
            "shipping": "20.00",
            "invoice_date": str(date.today()),
            "terms": "NET_30",
            "status": "sent",
        }
        update_res = self.client.put(f"/invoices/{invoice_id}", json=update_payload, headers=self.auth_header)
        self.assertEqual(update_res.status_code, 200, update_res.text)
        updated = update_res.json()
        self.assertEqual(updated["shipping"], "20.00")
        self.assertEqual(updated["total"], "266.75")
        self.assertEqual(updated["terms"], "NET_30")
        self.assertEqual(
            Decimal(updated["total"]),
            Decimal(updated["subtotal"]) + Decimal(updated["sales_tax"]) + Decimal(updated["shipping"]),
        )
        self.assertEqual(updated["due_date"], (date.today() + timedelta(days=30)).isoformat())

        mark_paid_res = self.client.post(
            f"/invoices/{invoice_id}/mark-paid",
            json={},
            headers=self.auth_header,
        )
        self.assertEqual(mark_paid_res.status_code, 200, mark_paid_res.text)
        self.assertEqual(mark_paid_res.json()["status"], "paid")
        self.assertIsNotNone(mark_paid_res.json()["payment_recorded_at"])

        delete_res = self.client.delete(f"/invoices/{invoice_id}", headers=self.auth_header)
        self.assertEqual(delete_res.status_code, 200, delete_res.text)
        self.assertEqual(delete_res.json()["status"], "cancelled")

    def test_reject_invoice_without_customer_data(self):
        with SessionLocal() as db:
            row = Job(
                id=uuid4(),
                job_code="SM2-2024-2001",
                status="COMPLETED",
                service_type="Emergency Lockout",
                hours_worked=Decimal("1.00"),
                rate=Decimal("120.00"),
            )
            db.add(row)
            db.commit()
            job_id = str(row.id)

        create_payload = {
            "dispatch_job_ids": [job_id],
            "terms": "NET_15",
        }
        create_res = self.client.post("/invoices", json=create_payload, headers=self.auth_header)
        self.assertEqual(create_res.status_code, 422, create_res.text)
        self.assertIn("customer", create_res.json()["detail"].lower())

    def test_reject_invoice_without_any_line_items(self):
        create_payload = {
            "terms": "NET_15",
            "shipping": "0.00",
        }
        create_res = self.client.post("/invoices", json=create_payload, headers=self.auth_header)
        self.assertEqual(create_res.status_code, 422, create_res.text)
        self.assertIn("line item", str(create_res.json()["detail"]).lower())

    def test_manual_line_item_tax_and_total_rules(self):
        create_payload = {
            "invoice_number": "INV-1911",
            "invoice_date": str(date.today()),
            "terms": "CUSTOM",
            "custom_term_days": 10,
            "company_info": {
                "name": "SM2 Dispatch",
                "street_address": "123 Dispatch Ave",
                "city": "Quebec",
                "state": "QC",
                "zip_code": "G1A 1A1",
                "phone": "+1-418-555-0100",
                "email": "billing@sm2dispatch.com",
                "website": "https://www.sm2dispatch.com",
            },
            "bill_to": {
                "name": "Audi de Quebec",
                "street": "999 Grande Allee",
                "city": "Quebec",
                "state": "QC",
                "zip_code": "G1R 2K4",
            },
            "line_items": [
                {
                    "product_service": "Key Programming",
                    "description": "Electronic key setup",
                    "qty": "2",
                    "rate": "100",
                    "tax_code": "GST",
                },
                {
                    "product_service": "Road Service",
                    "description": "On-site response",
                    "quantity": "1",
                    "rate": "50",
                    "tax_code": "EXEMPT",
                },
            ],
            "shipping": "5.00",
            "status": "draft",
        }
        create_res = self.client.post("/invoices", json=create_payload, headers=self.auth_header)
        self.assertEqual(create_res.status_code, 201, create_res.text)
        created = create_res.json()

        # amount = qty * rate, server-side only
        self.assertEqual(created["line_items"][0]["amount"], "200.00")
        self.assertEqual(created["line_items"][1]["amount"], "50.00")

        # subtotal = 250, tax = 10 (GST only on first line), shipping = 5, total = 265
        self.assertEqual(created["subtotal"], "250.00")
        self.assertEqual(created["sales_tax"], "10.00")
        self.assertEqual(created["shipping"], "5.00")
        self.assertEqual(created["total"], "265.00")
        self.assertEqual(
            Decimal(created["total"]),
            Decimal(created["subtotal"]) + Decimal(created["sales_tax"]) + Decimal(created["shipping"]),
        )
        self.assertEqual(created["due_date"], (date.today() + timedelta(days=10)).isoformat())

    def test_pending_approvals_route_returns_completed_uninvoiced_jobs(self):
        dealership = self._seed_dealership()
        technician = self._seed_technician()

        with SessionLocal() as db:
            row = Job(
                id=uuid4(),
                job_code="SM2-2024-3001",
                status="COMPLETED",
                assigned_tech_id=technician.id,
                dealership_id=dealership.id,
                customer_name=dealership.name,
                customer_address=dealership.address,
                customer_city=dealership.city,
                customer_state="QC",
                customer_zip_code=dealership.postal_code,
                service_type="Diagnostics",
                hours_worked=Decimal("2.00"),
                rate=Decimal("100.00"),
                vehicle="2024 BMW X5",
            )
            db.add(row)

            invalid_row = Job(
                id=uuid4(),
                job_code="SM2-2024-3002",
                status="COMPLETED",
                assigned_tech_id=technician.id,
                dealership_id=None,
                customer_name="",
                customer_address="",
                service_type="Diagnostics",
                hours_worked=Decimal("1.00"),
                rate=Decimal("100.00"),
                vehicle="2024 BMW X3",
            )
            db.add(invalid_row)
            db.commit()

        res = self.client.get("/invoices/pending-approvals", headers=self.auth_header)
        self.assertEqual(res.status_code, 200, res.text)
        payload = res.json()
        self.assertEqual(len(payload), 1)
        self.assertEqual(payload[0]["job_code"], "SM2-2024-3001")
        self.assertEqual(payload[0]["technician_name"], "Jolianne")
        self.assertEqual(payload[0]["dealership_name"], "Audi de Quebec")
        self.assertEqual(payload[0]["estimated_subtotal"], "200.00")
        self.assertEqual(payload[0]["estimated_sales_tax"], "0.00")
        self.assertEqual(payload[0]["estimated_total"], "200.00")
        self.assertEqual(payload[0]["services"][0]["name"], "Diagnostics")
        self.assertEqual(payload[0]["services"][0]["price"], "100.00")
        self.assertEqual(payload[0]["services"][0]["quantity"], "2.00")

    def test_pending_approval_estimate_matches_created_invoice_totals(self):
        dealership = self._seed_dealership()
        technician = self._seed_technician()

        with SessionLocal() as db:
            row = Job(
                id=uuid4(),
                job_code="SM2-2024-4001",
                status="COMPLETED",
                assigned_tech_id=technician.id,
                dealership_id=dealership.id,
                customer_name=dealership.name,
                customer_address=dealership.address,
                customer_city=dealership.city,
                customer_state="QC",
                customer_zip_code=dealership.postal_code,
                service_type="Key Programming",
                hours_worked=Decimal("2.00"),
                rate=Decimal("100.00"),
                tax_code="GST",
                vehicle="2024 Audi Q5",
            )
            db.add(row)
            db.commit()
            job_id = str(row.id)

        pending_res = self.client.get("/invoices/pending-approvals", headers=self.auth_header)
        self.assertEqual(pending_res.status_code, 200, pending_res.text)
        pending_rows = pending_res.json()
        row = next((item for item in pending_rows if item["job_id"] == job_id), None)
        self.assertIsNotNone(row)
        self.assertEqual(row["estimated_subtotal"], "200.00")
        self.assertEqual(row["estimated_sales_tax"], "10.00")
        self.assertEqual(row["estimated_total"], "210.00")

        create_res = self.client.post(
            "/invoices",
            json={
                "dispatch_job_ids": [job_id],
                "terms": "NET_15",
                "shipping": "0.00",
                "approval_note": "Reviewed by QA",
                "status": "sent",
            },
            headers=self.auth_header,
        )
        self.assertEqual(create_res.status_code, 201, create_res.text)
        created = create_res.json()
        self.assertEqual(created["subtotal"], row["estimated_subtotal"])
        self.assertEqual(created["sales_tax"], row["estimated_sales_tax"])
        self.assertEqual(created["total"], row["estimated_total"])
        self.assertEqual(created["approval_note"], "Reviewed by QA")

    def test_pending_approvals_and_invoice_creation_use_job_services(self):
        dealership = self._seed_dealership()
        technician = self._seed_technician()

        with SessionLocal() as db:
            row = Job(
                id=uuid4(),
                job_code="SM2-2024-4100",
                status="COMPLETED",
                assigned_tech_id=technician.id,
                dealership_id=dealership.id,
                customer_name=dealership.name,
                customer_address=dealership.address,
                customer_city=dealership.city,
                customer_state="QC",
                customer_zip_code=dealership.postal_code,
                service_type="Remote Starter Installation",
                hours_worked=Decimal("2.00"),
                rate=Decimal("125.00"),
                tax_code="GST",
                vehicle="2024 Audi Q7",
            )
            db.add(row)
            db.flush()
            db.add(
                JobService(
                    job_id=row.id,
                    service_name_snapshot="Remote Starter Installation",
                    source="dealership",
                    quantity=Decimal("1.00"),
                    unit_price=Decimal("250.00"),
                    sort_order=0,
                )
            )
            db.add(
                JobService(
                    job_id=row.id,
                    service_name_snapshot="Window Tint",
                    source="technician",
                    quantity=Decimal("1.00"),
                    unit_price=Decimal("120.00"),
                    sort_order=1,
                )
            )
            db.commit()
            job_id = str(row.id)

        pending_res = self.client.get("/invoices/pending-approvals", headers=self.auth_header)
        self.assertEqual(pending_res.status_code, 200, pending_res.text)
        pending_row = next((item for item in pending_res.json() if item["job_id"] == job_id), None)
        self.assertIsNotNone(pending_row)
        self.assertEqual(len(pending_row["services"]), 2)
        self.assertEqual(pending_row["services"][0]["name"], "Remote Starter Installation")
        self.assertEqual(pending_row["services"][1]["name"], "Window Tint")
        self.assertEqual(pending_row["estimated_subtotal"], "370.00")
        self.assertEqual(pending_row["estimated_sales_tax"], "18.50")
        self.assertEqual(pending_row["estimated_total"], "388.50")

        create_res = self.client.post(
            "/invoices",
            json={
                "dispatch_job_ids": [job_id],
                "terms": "NET_15",
                "shipping": "0.00",
                "status": "sent",
            },
            headers=self.auth_header,
        )
        self.assertEqual(create_res.status_code, 201, create_res.text)
        created = create_res.json()
        self.assertEqual(len(created["line_items"]), 2)
        self.assertEqual(created["line_items"][0]["product_service"], "Remote Starter Installation")
        self.assertEqual(created["line_items"][1]["product_service"], "Window Tint")
        self.assertEqual(created["subtotal"], "370.00")
        self.assertEqual(created["sales_tax"], "18.50")
        self.assertEqual(created["total"], "388.50")

    def test_pending_approval_issues_route_returns_blocking_reasons(self):
        dealership = self._seed_dealership()
        technician = self._seed_technician()

        with SessionLocal() as db:
            row = Job(
                id=uuid4(),
                job_code="SM2-2024-4200",
                status="COMPLETED",
                assigned_tech_id=technician.id,
                dealership_id=None,
                customer_name="",
                customer_address=None,
                customer_city=dealership.city,
                customer_state="QC",
                customer_zip_code=dealership.postal_code,
                service_type="Diagnostics",
                vehicle="2024 Audi A5",
                tax_code="GST",
            )
            db.add(row)
            db.flush()
            db.add(
                JobService(
                    job_id=row.id,
                    service_name_snapshot="Diagnostics",
                    source="dealership",
                    quantity=Decimal("1.00"),
                    unit_price=Decimal("0.00"),
                    sort_order=0,
                )
            )
            db.commit()

        issues_res = self.client.get("/invoices/pending-approval-issues", headers=self.auth_header)
        self.assertEqual(issues_res.status_code, 200, issues_res.text)
        issues = issues_res.json()
        issue = next((item for item in issues if item["job_code"] == "SM2-2024-4200"), None)
        self.assertIsNotNone(issue)
        self.assertTrue(any("address" in reason.lower() for reason in issue["blocking_reasons"]))
        self.assertTrue(any("missing price" in reason.lower() for reason in issue["blocking_reasons"]))

    def test_reports_pending_approvals_matches_invoice_pending_endpoint(self):
        dealership = self._seed_dealership()
        technician = self._seed_technician()

        with SessionLocal() as db:
            valid_job = Job(
                id=uuid4(),
                job_code="SM2-2024-5001",
                status="COMPLETED",
                assigned_tech_id=technician.id,
                dealership_id=dealership.id,
                customer_name=dealership.name,
                customer_address=dealership.address,
                customer_city=dealership.city,
                customer_state="QC",
                customer_zip_code=dealership.postal_code,
                service_type="Diagnostics",
                hours_worked=Decimal("1.00"),
                rate=Decimal("80.00"),
                vehicle="2024 Audi A4",
                tax_code="EXEMPT",
            )
            db.add(valid_job)

            invalid_job = Job(
                id=uuid4(),
                job_code="SM2-2024-5002",
                status="COMPLETED",
                assigned_tech_id=technician.id,
                dealership_id=None,
                customer_name="",
                customer_address="",
                service_type="Diagnostics",
                hours_worked=Decimal("1.00"),
                rate=Decimal("80.00"),
                vehicle="2024 Audi A3",
            )
            db.add(invalid_job)
            db.commit()

        pending_res = self.client.get("/invoices/pending-approvals", headers=self.auth_header)
        self.assertEqual(pending_res.status_code, 200, pending_res.text)
        self.assertEqual(len(pending_res.json()), 1)

        overview_res = self.client.get(
            "/admin/reports/overview",
            params={
                "from_date": str(date.today() - timedelta(days=7)),
                "to_date": str(date.today()),
            },
            headers=self.auth_header,
        )
        self.assertEqual(overview_res.status_code, 200, overview_res.text)
        overview_payload = overview_res.json()
        self.assertEqual(overview_payload["kpis"]["pending_approvals"], 1)
        pending_row = next(
            (row for row in overview_payload["invoice_performance"] if row["state"] == "Pending Approval"),
            None,
        )
        self.assertIsNotNone(pending_row)
        self.assertEqual(pending_row["count"], 1)

    def test_invoice_branding_settings_endpoints_and_invoice_defaults(self):
        get_default_res = self.client.get(
            "/admin/settings/invoice-branding",
            headers=self.auth_header,
        )
        self.assertEqual(get_default_res.status_code, 200, get_default_res.text)
        default_payload = get_default_res.json()
        self.assertEqual(default_payload["name"], "SM2 Dispatch")

        update_payload = {
            "logo_url": "https://example.com/logo.png",
            "name": "SM2 Dispatch QA",
            "street_address": "500 Test Blvd",
            "city": "Quebec",
            "state": "QC",
            "zip_code": "G2A 1A1",
            "phone": "+1-418-555-9900",
            "email": "billing.qa@sm2dispatch.com",
            "website": "https://qa.sm2dispatch.com",
        }
        put_res = self.client.put(
            "/admin/settings/invoice-branding",
            json=update_payload,
            headers=self.auth_header,
        )
        self.assertEqual(put_res.status_code, 200, put_res.text)
        updated_payload = put_res.json()
        self.assertEqual(updated_payload["name"], update_payload["name"])
        self.assertEqual(updated_payload["email"], update_payload["email"])

        get_updated_res = self.client.get(
            "/admin/settings/invoice-branding",
            headers=self.auth_header,
        )
        self.assertEqual(get_updated_res.status_code, 200, get_updated_res.text)
        persisted_payload = get_updated_res.json()
        self.assertEqual(persisted_payload["name"], update_payload["name"])

        create_invoice_res = self.client.post(
            "/invoices",
            json={
                "terms": "NET_15",
                "bill_to": {
                    "name": "Audi de Quebec",
                    "street": "999 Grande Allee",
                    "city": "Quebec",
                    "state": "QC",
                    "zip_code": "G1R 2K4",
                },
                "line_items": [
                    {
                        "product_service": "Key Programming",
                        "description": "Electronic key setup",
                        "qty": "1",
                        "rate": "150.00",
                        "tax_code": "EXEMPT",
                    }
                ],
            },
            headers=self.auth_header,
        )
        self.assertEqual(create_invoice_res.status_code, 201, create_invoice_res.text)
        created_invoice = create_invoice_res.json()
        self.assertEqual(created_invoice["company_info"]["name"], update_payload["name"])
        self.assertEqual(created_invoice["company_info"]["email"], update_payload["email"])

    def test_priority_rules_crud_endpoints(self):
        list_res = self.client.get("/admin/settings/priority-rules", headers=self.auth_header)
        self.assertEqual(list_res.status_code, 200, list_res.text)
        initial_rows = list_res.json()
        self.assertGreaterEqual(len(initial_rows), 1)

        create_payload = {
            "description": "Escalate high-priority Audi intake",
            "dealership_id": "D-001",
            "service_id": None,
            "target_urgency": "HIGH",
            "ranking_score": 12,
            "is_active": True,
        }
        create_res = self.client.post(
            "/admin/settings/priority-rules",
            json=create_payload,
            headers=self.auth_header,
        )
        self.assertEqual(create_res.status_code, 201, create_res.text)
        created = create_res.json()
        self.assertEqual(created["description"], create_payload["description"])
        self.assertEqual(created["ranking_score"], create_payload["ranking_score"])
        rule_id = created["id"]

        patch_res = self.client.patch(
            f"/admin/settings/priority-rules/{rule_id}",
            json={"is_active": False},
            headers=self.auth_header,
        )
        self.assertEqual(patch_res.status_code, 200, patch_res.text)
        patched = patch_res.json()
        self.assertFalse(patched["is_active"])

        delete_res = self.client.delete(
            f"/admin/settings/priority-rules/{rule_id}",
            headers=self.auth_header,
        )
        self.assertEqual(delete_res.status_code, 200, delete_res.text)
        self.assertEqual(delete_res.json()["status"], "ok")


if __name__ == "__main__":
    unittest.main()
