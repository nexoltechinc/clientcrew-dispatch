const ENV_API_BASE_URL = (import.meta.env.VITE_BACKEND_URL || '').trim();
const API_BASE_URL = (
  import.meta.env.DEV
    ? (ENV_API_BASE_URL || 'http://localhost:8000')
    : '/api'
).replace(/\/$/, '');

type RequestMethod = 'GET' | 'POST';

type RequestOptions = {
  method?: RequestMethod;
  body?: unknown;
};

type ErrorPayload = {
  detail?: unknown;
};

function extractErrorDetail(detail: unknown, fallback: string): string {
  if (typeof detail === 'string' && detail.trim()) {
    return detail;
  }
  if (detail && typeof detail === 'object') {
    try {
      const text = JSON.stringify(detail);
      if (text && text !== '{}') {
        return text;
      }
    } catch {
      // keep fallback
    }
  }
  return fallback;
}

async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    let detail = `Request failed (${response.status})`;
    try {
      const payload = await response.json() as ErrorPayload;
      if (payload?.detail) {
        detail = extractErrorDetail(payload.detail, detail);
      }
    } catch {
      // Keep fallback message.
    }
    throw new Error(detail);
  }

  return response.json() as Promise<T>;
}

export type CustomerBranding = {
  logo_url?: string | null;
  name: string;
  street_address: string;
  city: string;
  state: string;
  zip_code: string;
  phone: string;
  email: string;
  website: string;
  primary_color: string;
};

export type CustomerServiceCatalogItem = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  category: string;
  default_price: string | number;
  approval_required: boolean;
  status: string;
  updated_at: string;
};

export type CustomerServiceRequestPayload = {
  customer_name: string;
  contact_person: string;
  phone?: string | null;
  email?: string | null;
  vehicle_description: string;
  vehicle_unit_or_stock_number?: string | null;
  requested_services: string[];
  requested_service_text?: string | null;
  preferred_date: string;
  preferred_time: string;
  service_location_or_branch?: string | null;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  special_notes?: string | null;
  portal_session_id?: string | null;
  idempotency_key?: string | null;
  source_channel?: 'website_chatbot' | 'customer_portal' | 'booking_form' | 'status_page';
};

export type CustomerServiceRequestResponse = {
  request_id: string;
  reference_number: string;
  job_code: string;
  status: string;
  status_label: string;
  summary: string;
  next_step: string;
  submitted_at: string;
  customer_name: string;
  service_summary: string;
  vehicle_summary: string;
  agent_available: boolean;
};

export type CustomerJobLookupResult = {
  reference_number: string;
  job_code: string;
  status: string;
  status_label: string;
  summary: string;
  service_summary: string;
  vehicle_summary: string;
  next_step: string;
  requested_service_date?: string | null;
  requested_service_time?: string | null;
  updated_at: string;
};

export type CustomerJobLookupResponse = {
  found: boolean;
  multiple_matches: boolean;
  message: string;
  query: string;
  matches: CustomerJobLookupResult[];
};

export type CustomerInvoiceLookupResult = {
  invoice_number: string;
  job_code?: string | null;
  status: string;
  status_label: string;
  summary: string;
  total: string | number;
  due_date: string;
  next_step: string;
  updated_at: string;
};

export type CustomerInvoiceLookupResponse = {
  found: boolean;
  multiple_matches: boolean;
  message: string;
  query: string;
  matches: CustomerInvoiceLookupResult[];
};

export async function fetchCustomerBranding(): Promise<CustomerBranding> {
  return requestJson<CustomerBranding>('/customer/branding');
}

export async function fetchCustomerServices(): Promise<CustomerServiceCatalogItem[]> {
  return requestJson<CustomerServiceCatalogItem[]>('/customer/services');
}

export async function submitCustomerServiceRequest(
  payload: CustomerServiceRequestPayload,
): Promise<CustomerServiceRequestResponse> {
  return requestJson<CustomerServiceRequestResponse>('/customer/service-requests', {
    method: 'POST',
    body: payload,
  });
}

export async function lookupCustomerJob(payload: {
  job_code?: string | null;
  customer_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
}): Promise<CustomerJobLookupResponse> {
  const params = new URLSearchParams();
  if (payload.job_code) {
    params.set('job_code', payload.job_code);
  }
  if (payload.customer_name) {
    params.set('customer_name', payload.customer_name);
  }
  if (payload.contact_email) {
    params.set('contact_email', payload.contact_email);
  }
  if (payload.contact_phone) {
    params.set('contact_phone', payload.contact_phone);
  }

  const query = params.toString();
  return requestJson<CustomerJobLookupResponse>(`/customer/jobs/lookup${query ? `?${query}` : ''}`);
}

export async function lookupCustomerInvoice(payload: {
  invoice_number?: string | null;
  job_code?: string | null;
  customer_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
}): Promise<CustomerInvoiceLookupResponse> {
  const params = new URLSearchParams();
  if (payload.invoice_number) {
    params.set('invoice_number', payload.invoice_number);
  }
  if (payload.job_code) {
    params.set('job_code', payload.job_code);
  }
  if (payload.customer_name) {
    params.set('customer_name', payload.customer_name);
  }
  if (payload.contact_email) {
    params.set('contact_email', payload.contact_email);
  }
  if (payload.contact_phone) {
    params.set('contact_phone', payload.contact_phone);
  }

  const query = params.toString();
  return requestJson<CustomerInvoiceLookupResponse>(`/customer/invoices/lookup${query ? `?${query}` : ''}`);
}
