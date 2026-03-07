from datetime import datetime
from typing import List, Optional
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models.signup_request import SignupRequest


class SignupRequestRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, request_id: UUID) -> Optional[SignupRequest]:
        return self.db.query(SignupRequest).filter(SignupRequest.id == request_id).first()

    def get_by_email(self, email: str) -> Optional[SignupRequest]:
        return (
            self.db.query(SignupRequest)
            .filter(func.lower(SignupRequest.email) == email.lower())
            .first()
        )

    def list_requests(self, status: Optional[str] = None) -> List[SignupRequest]:
        query = self.db.query(SignupRequest)
        if status:
            query = query.filter(SignupRequest.status == status)
        return query.order_by(SignupRequest.requested_at.desc()).all()

    def create_request(self, *, name: str, email: str, phone: Optional[str], password: str) -> SignupRequest:
        row = SignupRequest(
            name=name,
            email=email.lower(),
            phone=phone,
            password=password,
            status="pending",
        )
        self.db.add(row)
        self.db.flush()
        self.db.refresh(row)
        return row

    def reset_as_pending(
        self,
        row: SignupRequest,
        *,
        name: str,
        email: str,
        phone: Optional[str],
        password: str,
        now: datetime,
    ) -> SignupRequest:
        row.name = name
        row.email = email.lower()
        row.phone = phone
        row.password = password
        row.status = "pending"
        row.requested_at = now
        row.updated_at = now
        row.rejection_reason = None
        row.approved_technician_id = None
        self.db.flush()
        self.db.refresh(row)
        return row

    def mark_approved(self, row: SignupRequest, technician_id: UUID, now: datetime) -> SignupRequest:
        row.status = "approved"
        row.approved_technician_id = technician_id
        row.updated_at = now
        row.rejection_reason = None
        self.db.flush()
        self.db.refresh(row)
        return row

    def mark_rejected(self, row: SignupRequest, reason: Optional[str], now: datetime) -> SignupRequest:
        row.status = "rejected"
        row.updated_at = now
        row.rejection_reason = reason
        self.db.flush()
        self.db.refresh(row)
        return row

