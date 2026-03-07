from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from ..core.enums import UserRole
from ..core.security import AuthenticatedUser
from ..models.priority_rule import PriorityRule
from ..schemas.settings import (
    PriorityRuleCreatePayload,
    PriorityRuleResponse,
    PriorityRuleUpdatePayload,
)


class PriorityRulesService:
    def __init__(self, db: Session, current_user: AuthenticatedUser):
        self.db = db
        self.current_user = current_user

    def list_rules(self) -> list[PriorityRuleResponse]:
        self._ensure_seed_data()
        rows = self.db.query(PriorityRule).order_by(PriorityRule.created_at.asc()).all()
        return [self._to_response(row) for row in rows]

    def create_rule(self, payload: PriorityRuleCreatePayload) -> PriorityRuleResponse:
        row = PriorityRule(
            description=payload.description,
            dealership_id=payload.dealership_id,
            service_id=payload.service_id,
            target_urgency=payload.target_urgency,
            ranking_score=payload.ranking_score,
            is_active=payload.is_active,
            created_by=self._updated_by_value(),
            updated_by=self._updated_by_value(),
        )
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return self._to_response(row)

    def update_rule(self, rule_id: UUID, payload: PriorityRuleUpdatePayload) -> PriorityRuleResponse:
        row = self._require_rule(rule_id)
        updates = payload.model_dump(exclude_unset=True)
        if not updates:
            return self._to_response(row)

        if "description" in updates:
            row.description = updates["description"]
        if "dealership_id" in updates:
            row.dealership_id = updates["dealership_id"]
        if "service_id" in updates:
            row.service_id = updates["service_id"]
        if "target_urgency" in updates:
            row.target_urgency = updates["target_urgency"]
        if "ranking_score" in updates:
            row.ranking_score = updates["ranking_score"]
        if "is_active" in updates:
            row.is_active = bool(updates["is_active"])

        row.updated_by = self._updated_by_value()
        self.db.commit()
        self.db.refresh(row)
        return self._to_response(row)

    def delete_rule(self, rule_id: UUID) -> dict[str, str]:
        row = self._require_rule(rule_id)
        self.db.delete(row)
        self.db.commit()
        return {"status": "ok"}

    def _require_rule(self, rule_id: UUID) -> PriorityRule:
        row = self.db.query(PriorityRule).filter(PriorityRule.id == rule_id).first()
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Priority rule not found")
        return row

    def _to_response(self, row: PriorityRule) -> PriorityRuleResponse:
        return PriorityRuleResponse(
            id=str(row.id),
            description=row.description,
            dealership_id=row.dealership_id,
            service_id=row.service_id,
            target_urgency=row.target_urgency,
            ranking_score=row.ranking_score,
            is_active=bool(row.is_active),
            created_at=row.created_at,
            updated_at=row.updated_at,
        )

    def _updated_by_value(self) -> str:
        role = self.current_user.role.value if isinstance(self.current_user.role, UserRole) else str(self.current_user.role)
        return f"{role}:{self.current_user.user_id}"

    def _ensure_seed_data(self) -> None:
        existing_count = self.db.query(PriorityRule.id).count()
        if existing_count > 0:
            return

        defaults = [
            PriorityRule(
                description="Always prioritize Audi de Quebec jobs",
                dealership_id="D-005",
                target_urgency="HIGH",
                ranking_score=10,
                is_active=True,
                created_by="system-seed",
                updated_by="system-seed",
            ),
            PriorityRule(
                description="Diagnostic jobs for D-001 are critical",
                dealership_id="D-001",
                service_id="svc-4",
                target_urgency="CRITICAL",
                ranking_score=15,
                is_active=True,
                created_by="system-seed",
                updated_by="system-seed",
            ),
            PriorityRule(
                description="Mazda vehicles at Donnacona receive high priority",
                dealership_id="D-012",
                target_urgency="HIGH",
                ranking_score=5,
                is_active=True,
                created_by="system-seed",
                updated_by="system-seed",
            ),
        ]
        self.db.bulk_save_objects(defaults)
        self.db.commit()
