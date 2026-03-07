from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path
from typing import Iterable
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..core.enums import UserRole
from ..core.security import AuthenticatedUser
from ..models.service_catalog import ServiceCatalog
from ..schemas.admin_services import (
    AdminServiceCreateRequest,
    AdminServiceResponse,
    AdminServiceStatusUpdateRequest,
    AdminServiceUpdateRequest,
)


class ServiceCatalogService:
    _SEED_PATH = Path(__file__).resolve().parents[1] / "data" / "services_seed.json"

    def __init__(self, db: Session, current_user: AuthenticatedUser | None = None):
        self.db = db
        self.current_user = current_user

    def list_admin_services(
        self,
        include_archived: bool = True,
    ) -> list[AdminServiceResponse]:
        self._ensure_seed_data()
        self._ensure_compatibility_aliases()
        query = self.db.query(ServiceCatalog)
        if not include_archived:
            query = query.filter(ServiceCatalog.status == "active")
        rows = query.order_by(ServiceCatalog.name.asc()).all()
        return [self._to_response(row) for row in rows]

    def list_active_services(self) -> list[AdminServiceResponse]:
        self._ensure_seed_data()
        self._ensure_compatibility_aliases()
        rows = (
            self.db.query(ServiceCatalog)
            .filter(ServiceCatalog.status == "active")
            .order_by(ServiceCatalog.name.asc())
            .all()
        )
        return [self._to_response(row) for row in rows]

    def create_service(self, payload: AdminServiceCreateRequest) -> AdminServiceResponse:
        self._ensure_seed_data()
        self._ensure_compatibility_aliases()
        code = payload.code.strip().upper()
        name = payload.name.strip()
        category = payload.category.strip() or "General"
        if payload.status not in {"active", "archived"}:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid status")

        existing = (
            self.db.query(ServiceCatalog)
            .filter(func.lower(ServiceCatalog.code) == code.lower())
            .first()
        )
        if existing is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Service code already exists")

        row = ServiceCatalog(
            code=code,
            name=name,
            category=category,
            default_price=payload.default_price,
            approval_required=payload.approval_required,
            status=payload.status,
            notes=payload.notes,
            updated_by=self._updated_by_value(),
        )
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return self._to_response(row)

    def update_service(self, service_id: UUID, payload: AdminServiceUpdateRequest) -> AdminServiceResponse:
        self._ensure_compatibility_aliases()
        row = self._require_service(service_id)
        updates = payload.dict(exclude_unset=True)
        if not updates:
            return self._to_response(row)

        if "code" in updates and updates["code"] is not None:
            normalized_code = updates["code"].strip().upper()
            existing = (
                self.db.query(ServiceCatalog)
                .filter(func.lower(ServiceCatalog.code) == normalized_code.lower())
                .filter(ServiceCatalog.id != service_id)
                .first()
            )
            if existing is not None:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Service code already exists")
            row.code = normalized_code

        if "name" in updates and updates["name"] is not None:
            row.name = updates["name"].strip()
        if "category" in updates and updates["category"] is not None:
            row.category = updates["category"].strip() or "General"
        if "default_price" in updates and updates["default_price"] is not None:
            row.default_price = updates["default_price"]
        if "approval_required" in updates and updates["approval_required"] is not None:
            row.approval_required = bool(updates["approval_required"])
        if "notes" in updates:
            row.notes = updates["notes"]

        row.updated_by = self._updated_by_value()
        self.db.commit()
        self.db.refresh(row)
        return self._to_response(row)

    def update_status(self, service_id: UUID, payload: AdminServiceStatusUpdateRequest) -> AdminServiceResponse:
        self._ensure_compatibility_aliases()
        row = self._require_service(service_id)
        if payload.status not in {"active", "archived"}:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid status")
        row.status = payload.status
        row.updated_by = self._updated_by_value()
        self.db.commit()
        self.db.refresh(row)
        return self._to_response(row)

    def _require_service(self, service_id: UUID) -> ServiceCatalog:
        row = self.db.query(ServiceCatalog).filter(ServiceCatalog.id == service_id).first()
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found")
        return row

    def _to_response(self, row: ServiceCatalog) -> AdminServiceResponse:
        return AdminServiceResponse(
            id=row.id,
            qb_item_id=row.qb_item_id,
            code=row.code,
            name=row.name,
            sku=row.sku,
            description=row.description,
            qb_type=row.qb_type,
            category=row.category,
            default_price=Decimal(row.default_price or 0),
            approval_required=bool(row.approval_required),
            status=row.status,
            notes=row.notes,
            updated_at=row.updated_at,
            updated_by=row.updated_by,
        )

    def _updated_by_value(self) -> str:
        if self.current_user is None:
            return "system"
        role = self.current_user.role.value if isinstance(self.current_user.role, UserRole) else str(self.current_user.role)
        return f"{role}:{self.current_user.user_id}"

    def _ensure_seed_data(self) -> None:
        existing_count = self.db.query(ServiceCatalog.id).count()
        if existing_count > 0:
            return

        if not self._SEED_PATH.exists():
            return

        try:
            data = json.loads(self._SEED_PATH.read_text(encoding="utf-8"))
        except Exception:
            return

        if not isinstance(data, list):
            return

        rows: list[ServiceCatalog] = []
        for item in data:
            if not isinstance(item, dict):
                continue
            code = str(item.get("code", "")).strip().upper()
            name = str(item.get("name", "")).strip()
            if not code or not name:
                continue
            sku = str(item.get("sku", "")).strip() or None
            description = str(item.get("description", "")).strip() or None
            category = str(item.get("category", "General")).strip() or "General"
            status_value = str(item.get("status", "active")).strip().lower()
            status_norm = status_value if status_value in {"active", "archived"} else "active"
            try:
                default_price = Decimal(str(item.get("default_price", "0") or "0"))
            except Exception:
                default_price = Decimal("0")
            notes = item.get("notes")
            notes_text = str(notes).strip() if notes is not None else None

            rows.append(
                ServiceCatalog(
                    code=code,
                    name=name,
                    sku=sku,
                    description=description,
                    category=category,
                    default_price=default_price,
                    approval_required=bool(item.get("approval_required", False)),
                    status=status_norm,
                    notes=notes_text,
                    updated_by="system-seed",
                )
            )

        if not rows:
            return
        try:
            self.db.bulk_save_objects(rows)
            self.db.commit()
        except IntegrityError:
            # Parallel seed attempts can race on unique(code). Treat as already seeded.
            self.db.rollback()

    def _ensure_compatibility_aliases(self) -> None:
        """
        Keep backward-compatible free-text service_type values mappable to catalog rows.
        This does not change jobs.service_type; it only guarantees catalog aliases exist.
        """
        aliases = [
            {
                "code": "CAT-PPF",
                "name": "PPF",
                "category": "PPF",
            },
            {
                "code": "CAT-WINDOW-TINT",
                "name": "Window Tint",
                "category": "Window Tint",
            },
            {
                "code": "CAT-REMOTE-STARTER-INSTALL",
                "name": "Remote starter installation",
                "category": "Remote Starter",
            },
        ]

        changed = False
        for alias in aliases:
            existing = (
                self.db.query(ServiceCatalog.id)
                .filter(func.lower(ServiceCatalog.name) == alias["name"].lower())
                .first()
            )
            if existing is not None:
                continue

            self.db.add(
                ServiceCatalog(
                    code=alias["code"],
                    name=alias["name"],
                    category=alias["category"],
                    default_price=Decimal("0"),
                    approval_required=False,
                    status="active",
                    notes="Compatibility alias for free-text job.service_type mapping",
                    updated_by="system-compat",
                )
            )
            changed = True

        if changed:
            try:
                self.db.commit()
            except IntegrityError:
                self.db.rollback()
