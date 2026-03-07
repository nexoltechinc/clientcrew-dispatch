import os
import unittest
from decimal import Decimal
from uuid import uuid4

os.environ["APP_ENV"] = "development"
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

from app.models.invoice import InvoiceLineItem
from app.services.invoice_service import (
    compute_line_item_amount,
    compute_subtotal,
    compute_tax,
    compute_total,
)


class InvoiceCalculationTests(unittest.TestCase):
    def test_compute_line_item_amount(self):
        self.assertEqual(compute_line_item_amount("2.5", "19.99"), Decimal("49.98"))

    def test_compute_subtotal_and_tax(self):
        line_1 = InvoiceLineItem(
            id=uuid4(),
            invoice_id=uuid4(),
            product_service="Service A",
            quantity=Decimal("2.00"),
            rate=Decimal("100.00"),
            amount=Decimal("200.00"),
            tax_code="GST",
            tax_rate=Decimal("0.05000"),
            tax_amount=Decimal("10.00"),
            line_order=0,
        )
        line_2 = InvoiceLineItem(
            id=uuid4(),
            invoice_id=uuid4(),
            product_service="Service B",
            quantity=Decimal("1.00"),
            rate=Decimal("50.00"),
            amount=Decimal("50.00"),
            tax_code="EXEMPT",
            tax_rate=Decimal("0"),
            tax_amount=Decimal("0.00"),
            line_order=1,
        )
        self.assertEqual(compute_subtotal([line_1, line_2]), Decimal("250.00"))
        self.assertEqual(compute_tax([line_1, line_2]), Decimal("10.00"))

    def test_compute_total_rule(self):
        subtotal = Decimal("250.00")
        tax = Decimal("10.00")
        shipping = Decimal("5.00")
        self.assertEqual(compute_total(subtotal, tax, shipping), Decimal("265.00"))


if __name__ == "__main__":
    unittest.main()
