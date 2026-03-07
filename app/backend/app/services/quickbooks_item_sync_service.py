from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any

import requests
from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..core.config import QB_ENV
from ..models.service_catalog import ServiceCatalog
from .quickbooks_connection_service import QuickBooksConnectionService


QUERY_PAGE_SIZE = 1000


@dataclass(frozen=True)
class QuickBooksItemSyncResult:
    synced_count: int
    created_count: int
    updated_count: int
    archived_count: int


class QuickBooksItemSyncService:
    def __init__(self, db: Session):
        self.db = db
        self.connection_service = QuickBooksConnectionService(db)

    def sync_items(self) -> QuickBooksItemSyncResult:
        connection = self.connection_service.get_active_connection_or_raise(refresh_if_needed=True)
        items = self._fetch_all_items(realm_id=connection.realm_id, access_token=connection.access_token)

        created_count = 0
        updated_count = 0
        archived_count = 0
        synced_count = 0

        for item in items:
            row, created = self._upsert_item(item)
            synced_count += 1
            if created:
                created_count += 1
            else:
                updated_count += 1
            if row.status == "archived":
                archived_count += 1

        return QuickBooksItemSyncResult(
            synced_count=synced_count,
            created_count=created_count,
            updated_count=updated_count,
            archived_count=archived_count,
        )

    def _fetch_all_items(self, *, realm_id: str, access_token: str) -> list[dict[str, Any]]:
        base_url = self._company_api_base()
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json",
            "Content-Type": "application/text",
        }

        items: list[dict[str, Any]] = []
        start_position = 1
        while True:
            # QuickBooks list queries can default to active-only records unless Active is explicit.
            # Include both states so the backend mirrors the full Products and Services catalog.
            query = (
                "SELECT * FROM Item "
                "WHERE Active IN (true,false) "
                f"STARTPOSITION {start_position} MAXRESULTS {QUERY_PAGE_SIZE}"
            )
            response = requests.post(
                f"{base_url}/company/{realm_id}/query",
                headers=headers,
                params={"minorversion": 75},
                data=query,
                timeout=30,
            )
            try:
                payload = response.json()
            except ValueError as exc:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="QuickBooks item query returned invalid JSON.",
                ) from exc

            if not response.ok:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail={
                        "message": "QuickBooks item query failed.",
                        "provider_status": response.status_code,
                        "provider_response": payload,
                    },
                )

            query_response = payload.get("QueryResponse") if isinstance(payload, dict) else None
            page_items = query_response.get("Item") if isinstance(query_response, dict) else []
            normalized_page_items = page_items if isinstance(page_items, list) else ([page_items] if page_items else [])

            for raw in normalized_page_items:
                if isinstance(raw, dict):
                    items.append(raw)

            if len(normalized_page_items) < QUERY_PAGE_SIZE:
                break
            start_position += QUERY_PAGE_SIZE

        return items

    def _upsert_item(self, item: dict[str, Any]) -> tuple[ServiceCatalog, bool]:
        qb_item_id = str(item.get("Id") or "").strip()
        name = str(item.get("Name") or "").strip()
        if not qb_item_id or not name:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="QuickBooks returned an item without Id or Name.",
            )

        sku = str(item.get("Sku") or "").strip() or None
        description = str(item.get("Description") or "").strip() or None
        qb_type = str(item.get("Type") or "").strip() or None
        unit_price = self._to_decimal(item.get("UnitPrice"))
        is_active = bool(item.get("Active", True))
        status_value = "active" if is_active else "archived"

        row = (
            self.db.query(ServiceCatalog)
            .filter(ServiceCatalog.qb_item_id == qb_item_id)
            .first()
        )
        created = False
        if row is None and sku:
            row = (
                self.db.query(ServiceCatalog)
                .filter(func.lower(ServiceCatalog.code) == sku.lower())
                .first()
            )
        if row is None:
            row = (
                self.db.query(ServiceCatalog)
                .filter(func.lower(ServiceCatalog.name) == name.lower())
                .first()
            )

        resolved_code = self._resolve_code(sku=sku, qb_item_id=qb_item_id, existing=row)
        category = qb_type or (row.category if row is not None else "General") or "General"

        if row is None:
            row = ServiceCatalog(
                qb_item_id=qb_item_id,
                code=resolved_code,
                name=name,
                sku=sku,
                description=description,
                qb_type=qb_type,
                category=category,
                default_price=unit_price,
                approval_required=False,
                status=status_value,
                updated_by="quickbooks-sync",
            )
            self.db.add(row)
            created = True
        else:
            row.qb_item_id = qb_item_id
            row.code = resolved_code
            row.name = name
            row.sku = sku
            row.description = description
            row.qb_type = qb_type
            row.category = category
            row.default_price = unit_price
            row.status = status_value
            row.updated_by = "quickbooks-sync"

        try:
            self.db.flush()
        except IntegrityError as exc:
            self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Unable to sync QuickBooks item '{name}' due to a catalog code conflict.",
            ) from exc

        self.db.commit()
        self.db.refresh(row)
        return row, created

    def _resolve_code(self, *, sku: str | None, qb_item_id: str, existing: ServiceCatalog | None) -> str:
        if existing is not None and existing.code:
            return existing.code.strip().upper()
        if sku:
            candidate = sku.strip().upper()
            conflict = (
                self.db.query(ServiceCatalog.id)
                .filter(func.lower(ServiceCatalog.code) == candidate.lower())
                .first()
            )
            if conflict is None:
                return candidate
        return f"QB-ITEM-{qb_item_id}".upper()

    @staticmethod
    def _company_api_base() -> str:
        if QB_ENV == "production":
            return "https://quickbooks.api.intuit.com/v3"
        return "https://sandbox-quickbooks.api.intuit.com/v3"

    @staticmethod
    def _to_decimal(value: Any) -> Decimal:
        try:
            return Decimal(str(value if value is not None else "0")).quantize(Decimal("0.01"))
        except Exception:
            return Decimal("0.00")
