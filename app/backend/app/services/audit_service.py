from typing import Any, Optional
from uuid import UUID

from sqlalchemy.orm import Session

from ..core.enums import UserRole
from ..models.audit_log import AuditLog


class AuditService:
    @staticmethod
    def log_event(
        db: Session,
        *,
        actor_role: UserRole,
        actor_id: UUID,
        action: str,
        entity_type: str,
        entity_id: UUID,
        metadata: Optional[Any] = None,
    ) -> None:
        db.add(
            AuditLog(
                actor_role=actor_role.value,
                actor_id=actor_id,
                action=action,
                entity_type=entity_type,
                entity_id=entity_id,
                metadata_json=metadata,
            )
        )
