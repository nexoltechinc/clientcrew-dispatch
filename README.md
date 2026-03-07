# ClientCrew-Dispatch

ClientCrew-Dispatch is an AI-powered dispatch platform for storing customer contacts, analyzing inbound SMS via Make.com (Vonage and Twilio), creating service requests, assigning technicians, and tracking jobs and billing.

## Local Development

- Frontend: `app/` (Vite + React)
- Backend: `app/backend/` (FastAPI)

Run frontend:

```bash
cd app
npm run dev
```

Run backend:

```bash
cd app/backend
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
