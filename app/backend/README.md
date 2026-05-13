# DispatchIQ - Technician Module (FastAPI)

## Stack
- **Framework**: FastAPI
- **Database**: Neon/PostgreSQL
- **ORM**: SQLAlchemy
- **Validation**: Pydantic
- **Architecture**: Clean Service-Repository Layer

## Features
- **Normalized Data**: Separate tables for Skills, Zones, Working Hours, and Time Off.
- **Eligibility Engine**: optimized SQL query checking 7 constraints:
  - Active Status
  - Skill coverage
  - Zone coverage
  - Working hours validation (with overnight shift support)
  - Time-off overrides
  - Concurrent job limits
  - Previous rejections
- **Transactional Safety**: Uses `SELECT FOR UPDATE` and explicit transactions for job acceptance to prevent race conditions.
- **Soft Deactivation**: Hard deletes on technicians are blocked; deactivation via status update only.
- **Audit Ready**: Key actions (Rejection, Acceptance, Status Changes) are routed through an audit service.

## API Endpoints

### Technician Management
- `POST /technicians/`: Create new technician
- `GET /technicians/`: List technicians
- `GET /technicians/{id}`: Detailed view
- `PUT /technicians/{id}`: Update info
- `PATCH /technicians/{id}/status`: Activate/Deactivate
- `DELETE /technicians/{id}`: -> Blocked (405)

### Assignments & Availability
- `POST /technicians/{id}/skills`: Map skills
- `POST /technicians/{id}/zones`: Map zones
- `POST /technicians/{id}/working-hours`: Define shift
- `POST /technicians/{id}/time-off`: Record absence

### Dispatch & Actions
- `GET /technicians/eligible/{job_id}`: Fetch eligible technicians for a specific job.
- `POST /technicians/{id}/accept/{job_id}`: Accept a job (Checks constraints).
- `POST /technicians/{id}/reject/{job_id}`: Reject a job (Hides from future broadcasts).

### Invoices
- `POST /invoices`: Create invoice (QuickBooks-style payload, backend calculations).
- `GET /invoices/{id}`: Fetch invoice.
- `PUT /invoices/{id}`: Update invoice.
- `DELETE /invoices/{id}`: Void invoice (soft cancel).

## Setup
1. Configure environment variables (copy from `.env.example`):
   - `DATABASE_URL`
   - `JWT_SECRET_KEY`
   - Optional: `APP_ENV`, `CORS_ALLOW_ORIGINS`
   - Local PostgreSQL example:
     - `DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/dispatch_system`
2. Install Python dependencies:
   - `python -m pip install -r requirements.txt`
3. Run managed migrations:
   - Core schema only: `python scripts/migrate.py`
   - Include dev seed data: `python scripts/migrate.py --with-seed`
4. Run app: `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`

## Migration Notes
- `001_technician_module.sql` and `002_admin_technician_profile.sql` are core schema migrations.
- `003_technician.sql` is a development seed migration (legacy frontend technicians, zones, skills).
- `scripts/migrate.py` tracks applied versions in `schema_migrations` and skips already-applied files.

## QuickBooks Setup

### What Is Implemented
- OAuth start route: `GET /integrations/quickbooks/connect`
- OAuth callback route: `GET /integrations/quickbooks/callback`
- Webhook routes:
  - `GET /integrations/quickbooks/webhook`
  - `POST /integrations/quickbooks/webhook`
- Connection persistence in database table: `quickbooks_connections`
- Connection status route: `GET /integrations/quickbooks/status`

### Required Environment Variables
- `QB_CLIENT_ID`
- `QB_CLIENT_SECRET`
- `QB_REDIRECT_URI`
- `QB_ENV`
- `QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN`

Local example:
```env
QB_CLIENT_ID=
QB_CLIENT_SECRET=
QB_REDIRECT_URI=http://localhost:8000/integrations/quickbooks/callback
QB_ENV=sandbox
QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN=
```

Render example:
```env
QB_REDIRECT_URI=https://dispatch-alex.onrender.com/integrations/quickbooks/callback
QB_ENV=sandbox
```

### Intuit Configuration
- Redirect URI must exactly match `QB_REDIRECT_URI`
- Webhook endpoint must be:
  `https://dispatch-alex.onrender.com/integrations/quickbooks/webhook`
- If `QB_ENV=sandbox`, the Intuit account must have at least one sandbox company

### How To Connect
1. Open `/integrations/quickbooks/connect`
2. Sign in to Intuit
3. Approve the app
4. Intuit redirects to `/integrations/quickbooks/callback`
5. Backend exchanges the code for tokens and stores the active connection in `quickbooks_connections`

### How To Verify
- Webhook config:
  `GET /integrations/quickbooks/webhook`
- Connection status:
  `GET /integrations/quickbooks/status`

Successful status response should show:
- `connected: true`
- `realm_id`
- `is_active: true`
- `has_access_token: true`
- `has_refresh_token: true`

### Current Production State
- Render service URL: `https://dispatch-alex.onrender.com`
- QuickBooks connection is working in `sandbox`
- Webhook verification is configured
- Tokens are stored in database, not in a local file

### Remaining Improvement
- Automatic refresh-token rotation is not implemented yet

