import re
from typing import Any, Dict, List, Optional
from uuid import UUID

from sqlalchemy.orm import Session

from ..models.dealership import Dealership


DEALERSHIP_CODE_PATTERN = re.compile(r"^D-(\d+)$", re.IGNORECASE)


class DealershipRepository:
    def __init__(self, db: Session):
        self.db = db

    def list_dealerships(self) -> List[Dealership]:
        return self.db.query(Dealership).order_by(Dealership.code.asc()).all()

    def get_dealership_by_id(self, dealership_id: UUID) -> Optional[Dealership]:
        return self.db.query(Dealership).filter(Dealership.id == dealership_id).first()

    def get_dealership_by_code(self, code: str) -> Optional[Dealership]:
        normalized = code.strip().upper()
        return self.db.query(Dealership).filter(Dealership.code == normalized).first()

    def generate_next_code(self) -> str:
        max_number = 0
        for row in self.db.query(Dealership.code).all():
            code = str(row[0] or "").strip().upper()
            match = DEALERSHIP_CODE_PATTERN.match(code)
            if not match:
                continue
            value = int(match.group(1))
            if value > max_number:
                max_number = value

        next_number = max_number + 1
        return f"D-{next_number:03d}"

    def create_dealership(
        self,
        *,
        code: str,
        name: str,
        phone: Optional[str],
        email: Optional[str],
        address: Optional[str],
        city: Optional[str],
        postal_code: Optional[str],
        status: str,
        notes: Optional[str],
    ) -> Dealership:
        row = Dealership(
            code=code,
            name=name,
            phone=phone,
            email=email,
            address=address,
            city=city,
            postal_code=postal_code,
            status=status,
            notes=notes,
        )
        self.db.add(row)
        self.db.flush()
        self.db.refresh(row)
        return row

    def update_dealership_fields(
        self,
        dealership_id: UUID,
        fields: Dict[str, Any],
    ) -> Optional[Dealership]:
        row = self.get_dealership_by_id(dealership_id)
        if row is None:
            return None

        for key, value in fields.items():
            setattr(row, key, value)

        self.db.flush()
        self.db.refresh(row)
        return row
