import os
from pathlib import Path


def _strip_optional_quotes(value: str) -> str:
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1]
    return value


def _load_dotenv_file(path: Path) -> None:
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue

        if line.startswith("export "):
            line = line[len("export "):].strip()

        if "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        if not key:
            continue

        os.environ.setdefault(key, _strip_optional_quotes(value.strip()))


def load_local_env() -> None:
    backend_root = Path(__file__).resolve().parents[2]
    _load_dotenv_file(backend_root / ".env")


load_local_env()


def get_env(name: str, default: str) -> str:
    value = os.getenv(name)
    if value is None or value.strip() == "":
        return default
    return value


def get_required_env(name: str) -> str:
    value = os.getenv(name)
    if value is None or value.strip() == "":
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def get_env_csv(name: str, default: str) -> list[str]:
    value = get_env(name, default)
    return [item.strip() for item in value.split(",") if item.strip()]


def get_backend_root() -> Path:
    return Path(__file__).resolve().parents[2]


def normalize_database_url(value: str) -> str:
    normalized = value.strip()
    # Accept hosted Postgres URLs in common forms and route them to SQLAlchemy's psycopg driver.
    if normalized.startswith("postgres://"):
        return "postgresql+psycopg://" + normalized[len("postgres://"):]
    if normalized.startswith("postgresql://") and "+psycopg" not in normalized.split("://", 1)[0]:
        return "postgresql+psycopg://" + normalized[len("postgresql://"):]
    return normalized


APP_ENV = get_env("APP_ENV", "development").strip().lower()

DATABASE_URL = normalize_database_url(get_required_env("DATABASE_URL"))

JWT_SECRET_KEY = (
    get_env("JWT_SECRET_KEY", "change-me-dev-only")
    if APP_ENV == "development"
    else get_required_env("JWT_SECRET_KEY")
)
JWT_ALGORITHM = get_env("JWT_ALGORITHM", "HS256")
CORS_ALLOW_ORIGINS = get_env_csv(
    "CORS_ALLOW_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
)

COMPANY_LOGO_URL = get_env("COMPANY_LOGO_URL", "")
COMPANY_NAME = get_env("COMPANY_NAME", "SM2 Dispatch")
COMPANY_STREET_ADDRESS = get_env("COMPANY_STREET_ADDRESS", "123 Dispatch Ave")
COMPANY_CITY = get_env("COMPANY_CITY", "Quebec")
COMPANY_STATE = get_env("COMPANY_STATE", "QC")
COMPANY_ZIP_CODE = get_env("COMPANY_ZIP_CODE", "G1A 1A1")
COMPANY_PHONE = get_env("COMPANY_PHONE", "+1-418-555-0100")
COMPANY_EMAIL = get_env("COMPANY_EMAIL", "billing@sm2dispatch.com")
COMPANY_WEBSITE = get_env("COMPANY_WEBSITE", "https://www.sm2dispatch.com")
SMTP_EMAIL = get_env("SMTP_EMAIL", "").strip()
SMTP_APP_PASSWORD = get_env("SMTP_APP_PASSWORD", "").strip()
SMTP_HOST = get_env("SMTP_HOST", "smtp.gmail.com").strip()
SMTP_PORT = int(get_env("SMTP_PORT", "587"))
SMTP_FROM_NAME = get_env("SMTP_FROM_NAME", "SM2 Dispatch").strip()
PASSWORD_RESET_OTP_TTL_MINUTES = int(get_env("PASSWORD_RESET_OTP_TTL_MINUTES", "5"))
PASSWORD_RESET_TOKEN_TTL_MINUTES = int(get_env("PASSWORD_RESET_TOKEN_TTL_MINUTES", "10"))
PASSWORD_RESET_MAX_ATTEMPTS = int(get_env("PASSWORD_RESET_MAX_ATTEMPTS", "3"))
PASSWORD_RESET_MAX_REQUESTS_PER_HOUR = int(get_env("PASSWORD_RESET_MAX_REQUESTS_PER_HOUR", "3"))
QB_CLIENT_ID = get_env("QB_CLIENT_ID", "")
QB_CLIENT_SECRET = get_env("QB_CLIENT_SECRET", "")
QB_REDIRECT_URI = get_env("QB_REDIRECT_URI", "")
QB_ENV = get_env("QB_ENV", "sandbox").strip().lower()
QUICKBOOKS_ITEMS_SYNC_INTERVAL_SECONDS = max(0, int(get_env("QUICKBOOKS_ITEMS_SYNC_INTERVAL_SECONDS", "180")))
QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN = get_env("QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN", "")
QUICKBOOKS_WEBHOOK_DEVELOPMENT_VERIFIER_TOKEN = get_env(
    "QUICKBOOKS_WEBHOOK_DEVELOPMENT_VERIFIER_TOKEN",
    QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN,
)
QUICKBOOKS_WEBHOOK_PRODUCTION_VERIFIER_TOKEN = get_env(
    "QUICKBOOKS_WEBHOOK_PRODUCTION_VERIFIER_TOKEN",
    QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN,
)
ADMIN_EMAIL = get_env("ADMIN_EMAIL", "admin@sm2dispatch.com").strip().lower()
ADMIN_RECOVERY_EMAIL = get_env("ADMIN_RECOVERY_EMAIL", ADMIN_EMAIL).strip().lower()
ADMIN_DEFAULT_PASSWORD = get_env("ADMIN_DEFAULT_PASSWORD", "admin123")

if APP_ENV != "development" and JWT_SECRET_KEY.startswith("change-me"):
    raise RuntimeError("JWT_SECRET_KEY must be set to a secure value outside development")
