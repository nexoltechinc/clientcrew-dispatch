# Migrations Guide

## Files
- `001_technician_module.sql`: Legacy base schema.
- `002_admin_technician_profile.sql`: Admin technician profile schema alignment.
- `003_technician.sql`: Development-only seed data (legacy frontend technicians).
- `007_invoices.sql`: Invoice schema and constraints.
- `008_dispatch_job_invoice_fields.sql`: Dispatch-job invoice mapping fields.

## How to run
Use the managed runner from `backend/`:

```bash
python scripts/migrate.py
```

Include seed data for local testing:

```bash
python scripts/migrate.py --with-seed
```

## Notes
- `003_technician.sql` should not be used for production data initialization.
- `scripts/migrate.py` creates schema from SQLAlchemy models and stores applied versions in `schema_migrations`.
