from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class AdminServiceResponse(BaseModel):
    id: UUID
    qb_item_id: Optional[str] = None
    code: str
    name: str
    sku: Optional[str] = None
    description: Optional[str] = None
    qb_type: Optional[str] = None
    category: str
    default_price: Decimal
    approval_required: bool
    status: str
    notes: Optional[str] = None
    updated_at: datetime
    updated_by: Optional[str] = None


class AdminServiceCreateRequest(BaseModel):
    code: str = Field(..., min_length=1, max_length=128)
    name: str = Field(..., min_length=1, max_length=255)
    category: str = Field(default="General", min_length=1, max_length=128)
    default_price: Decimal = Field(default=Decimal("0"), ge=0)
    approval_required: bool = False
    status: str = Field(default="active")
    notes: Optional[str] = Field(default=None, max_length=2000)


class AdminServiceUpdateRequest(BaseModel):
    code: Optional[str] = Field(default=None, min_length=1, max_length=128)
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    category: Optional[str] = Field(default=None, min_length=1, max_length=128)
    default_price: Optional[Decimal] = Field(default=None, ge=0)
    approval_required: Optional[bool] = None
    notes: Optional[str] = Field(default=None, max_length=2000)


class AdminServiceStatusUpdateRequest(BaseModel):
    status: str = Field(..., pattern="^(active|archived)$")


class AdminQuickBooksSyncResponse(BaseModel):
    synced_count: int
    created_count: int
    updated_count: int
    archived_count: int
