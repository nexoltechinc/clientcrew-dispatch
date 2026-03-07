from pydantic import BaseModel, Field, field_validator


class ForgotPasswordRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)

    @field_validator("email")
    @classmethod
    def _normalize_email(cls, value: str) -> str:
        normalized = value.strip().lower()
        if not normalized:
            raise ValueError("email cannot be blank")
        return normalized


class ForgotPasswordResponse(BaseModel):
    message: str


class VerifyOtpRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    otp: str = Field(..., min_length=6, max_length=6)

    @field_validator("email")
    @classmethod
    def _normalize_email(cls, value: str) -> str:
        normalized = value.strip().lower()
        if not normalized:
            raise ValueError("email cannot be blank")
        return normalized

    @field_validator("otp")
    @classmethod
    def _normalize_otp(cls, value: str) -> str:
        normalized = value.strip()
        if len(normalized) != 6 or not normalized.isdigit():
            raise ValueError("otp must be a 6-digit code")
        return normalized


class VerifyOtpResponse(BaseModel):
    reset_token: str


class ResetPasswordRequest(BaseModel):
    reset_token: str = Field(..., min_length=20, max_length=4096)
    new_password: str = Field(..., min_length=6, max_length=255)

    @field_validator("reset_token", "new_password")
    @classmethod
    def _normalize_required(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("value cannot be blank")
        return normalized


class ResetPasswordResponse(BaseModel):
    status: str
