from pydantic import BaseModel, EmailStr, Field, validator
from uuid import UUID
from datetime import datetime, time
from typing import List, Optional
from enum import Enum

class TechStatus(str, Enum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"

class SkillBase(BaseModel):
    name: str
    is_active: bool = True

class SkillCreate(SkillBase):
    pass

class Skill(SkillBase):
    id: int

    class Config:
        from_attributes = True

class ZoneBase(BaseModel):
    name: str
    is_active: bool = True

class ZoneCreate(ZoneBase):
    pass

class Zone(ZoneBase):
    id: int

    class Config:
        from_attributes = True

class WorkingHoursBase(BaseModel):
    weekday: int = Field(..., ge=0, le=6)
    start_time: time
    end_time: time

class WorkingHoursCreate(WorkingHoursBase):
    pass

class WorkingHours(WorkingHoursBase):
    id: int
    tech_id: UUID

    class Config:
        from_attributes = True

class TimeOffBase(BaseModel):
    start_datetime: datetime
    end_datetime: datetime
    reason: Optional[str] = None

    @validator("start_datetime", "end_datetime")
    def timezone_required(cls, value: datetime):
        if value.tzinfo is None or value.tzinfo.utcoffset(value) is None:
            raise ValueError("Datetime must include timezone information")
        return value

    @validator("end_datetime")
    def validate_window(cls, end_datetime: datetime, values):
        start_datetime = values.get("start_datetime")
        if start_datetime and end_datetime <= start_datetime:
            raise ValueError("end_datetime must be later than start_datetime")
        return end_datetime

class TimeOffCreate(TimeOffBase):
    pass

class TimeOff(TimeOffBase):
    id: int
    tech_id: UUID

    class Config:
        from_attributes = True

class TechnicianBase(BaseModel):
    tech_code: str
    full_name: str
    phone_e164: str
    email: Optional[EmailStr] = None
    max_active_jobs: int = Field(2, ge=1)

    @validator("phone_e164")
    def validate_phone_e164(cls, value: str):
        import re

        if not re.match(r"^\+[1-9]\d{1,14}$", value):
            raise ValueError("phone_e164 must be in E.164 format (for example: +14165550123)")
        return value

class TechnicianCreate(TechnicianBase):
    pass

class TechnicianUpdate(BaseModel):
    full_name: Optional[str] = None
    phone_e164: Optional[str] = None
    email: Optional[EmailStr] = None
    max_active_jobs: Optional[int] = Field(None, ge=1)

    @validator("phone_e164")
    def validate_phone_e164_optional(cls, value: Optional[str]):
        if value is None:
            return value
        import re

        if not re.match(r"^\+[1-9]\d{1,14}$", value):
            raise ValueError("phone_e164 must be in E.164 format (for example: +14165550123)")
        return value

class TechnicianStatusUpdate(BaseModel):
    status: TechStatus

class Technician(TechnicianBase):
    id: UUID
    status: TechStatus
    created_at: datetime
    updated_at: datetime
    
    skills: List[Skill] = []
    zones: List[Zone] = []

    class Config:
        from_attributes = True

class JobRejectionCreate(BaseModel):
    reason: Optional[str] = None
