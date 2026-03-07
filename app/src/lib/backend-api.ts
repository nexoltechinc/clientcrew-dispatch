const ADMIN_TOKEN_STORAGE_KEY = 'sm_dispatch_admin_access_token';
const TECHNICIAN_TOKEN_STORAGE_KEY = 'sm_dispatch_technician_access_token';
const ENV_API_BASE_URL = (import.meta.env.VITE_BACKEND_URL || '').trim();
const API_BASE_URL = (
  import.meta.env.DEV
    ? (ENV_API_BASE_URL || 'http://localhost:8000')
    : '/api'
).replace(/\/$/, '');

type RequestMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

type RequestOptions = {
  method?: RequestMethod;
  token?: string | null;
  body?: unknown;
};

type ErrorPayload = {
  detail?: unknown;
};

type DevAdminTokenResponse = {
  access_token: string;
  token_type: string;
  expires_at: string;
  role: 'admin';
};

type DevTechnicianTokenResponse = {
  access_token: string;
  token_type: string;
  expires_at: string;
  role: 'technician';
};

export type BackendTechnicianListItem = {
  id: string;
  name: string;
  full_name?: string;
  email: string;
  phone?: string | null;
  profile_picture_url?: string | null;
  status: 'active' | 'deactivated';
  manual_availability: boolean;
  effective_availability: boolean;
  on_leave_now: boolean;
  current_shift_window?: string | null;
  next_time_off_start?: string | null;
  working_days?: number[];
  working_hours_start?: string | null;
  working_hours_end?: string | null;
  after_hours_enabled?: boolean;
  has_pending_email_change_request?: boolean;
  pending_email_change_request_id?: string | null;
  pending_email_change_requested_email?: string | null;
  zones: Array<{ id: string; name: string }>;
  skills: Array<{ id: string; name: string }>;
  current_jobs_count: number;
};

export type BackendOutOfOfficeRange = {
  id: string;
  start_date: string;
  end_date: string;
  reason: string;
  created_at: string;
};

export type BackendTechnicianProfile = {
  id: string;
  name: string;
  full_name: string;
  email: string;
  phone?: string | null;
  profile_picture_url?: string | null;
  status: 'active' | 'deactivated';
  manual_availability: boolean;
  effective_availability: boolean;
  on_leave_now: boolean;
  current_shift_window?: string | null;
  next_time_off_start?: string | null;
  working_days: number[];
  working_hours_start?: string | null;
  working_hours_end?: string | null;
  after_hours_enabled: boolean;
  has_pending_email_change_request: boolean;
  pending_email_change_request_id?: string | null;
  pending_email_change_requested_email?: string | null;
  weekly_schedule: Array<{
    day_of_week: number;
    is_enabled: boolean;
    start_time?: string | null;
    end_time?: string | null;
  }>;
  upcoming_time_off: Array<{
    id: string;
    technician_id: string;
    entry_type: string;
    start_date: string;
    end_date: string;
    reason: string;
    created_at: string;
    cancelled_at?: string | null;
  }>;
};

export type BackendEmailChangeRequest = {
  id: string;
  technician_id: string;
  technician_name?: string | null;
  current_email: string;
  requested_email: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requested_at: string;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  remarks?: string | null;
};

export type BackendSignupRequest = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  status: 'pending' | 'approved' | 'rejected';
  requested_at: string;
  updated_at: string;
};

export type BackendDealership = {
  id: string;
  code: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  status: 'active' | 'inactive';
  notes?: string | null;
  last_job_at?: string | null;
  recent_jobs: Array<{
    id: string;
    job_code: string;
    status: string;
    created_at: string;
    assigned_tech?: string | null;
  }>;
};

export type BackendServiceCatalogItem = {
  id: string;
  qb_item_id?: string | null;
  code: string;
  name: string;
  sku?: string | null;
  description?: string | null;
  qb_type?: string | null;
  category: string;
  default_price: string | number;
  approval_required: boolean;
  status: 'active' | 'archived';
  notes?: string | null;
  updated_at: string;
  updated_by?: string | null;
};

export type BackendAdminJob = {
  id: string;
  job_code: string;
  status: string;
  dealership_id?: string | null;
  dealership_name?: string | null;
  assigned_technician_id?: string | null;
  assigned_technician_name?: string | null;
  pre_assigned_technician_id?: string | null;
  pre_assigned_technician_name?: string | null;
  pre_assignment_reason?: string | null;
  service_type?: string | null;
  service_names?: string[];
  service_entries?: Array<{
    id: string;
    service_name: string;
    source: string;
    notes?: string | null;
    quantity: string | number;
    unit_price: string | number;
    sort_order: number;
  }>;
  vehicle?: string | null;
  created_at: string;
  updated_at: string;
  requested_service_date?: string | null;
  requested_service_time?: string | null;
  source_system?: string | null;
  source_metadata?: Record<string, unknown> | null;
};

export type BackendTechnicianJobFeedItem = {
  id: string;
  job_code: string;
  status: string;
  dealership_name?: string | null;
  service_name?: string | null;
  service_names?: string[];
  service_entries?: Array<{
    id: string;
    service_name: string;
    source: string;
    notes?: string | null;
    quantity: string | number;
    unit_price: string | number;
    sort_order: number;
  }>;
  vehicle_summary?: string | null;
  zone_name?: string | null;
  requested_service_date?: string | null;
  requested_service_time?: string | null;
  created_at: string;
  updated_at: string;
};

export type BackendTechnicianJobFeed = {
  available_jobs: BackendTechnicianJobFeedItem[];
  my_jobs: BackendTechnicianJobFeedItem[];
};

export type BackendTechnicianJobActionResponse = {
  job_id: string;
  status: string;
};

export type BackendInvoiceBrandingSettings = {
  logo_url?: string | null;
  name: string;
  street_address: string;
  city: string;
  state: string;
  zip_code: string;
  phone: string;
  email: string;
  website: string;
};

export type BackendAdminPasswordChangeResponse = {
  status: string;
  admin_email: string;
  password_changed_at: string;
};

export type BackendAdminCredentialSettings = {
  admin_email: string;
  recovery_email: string;
  password_changed_at: string;
  updated_at: string;
};

export type BackendForgotPasswordResponse = {
  message: string;
};

export type BackendVerifyOtpResponse = {
  reset_token: string;
};

export type BackendResetPasswordResponse = {
  status: string;
};

export type BackendTechnicianPasswordChangeResponse = {
  status: string;
  technician_email: string;
  password_changed_at: string;
};

export type BackendPriorityRule = {
  id: string;
  description: string;
  dealership_id: string;
  service_id?: string | null;
  target_urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  ranking_score: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type BackendCalendarEventType =
  | 'appointment'
  | 'service_job'
  | 'delivery'
  | 'technician_schedule'
  | 'reminder'
  | 'urgent';

export type BackendCalendarEventPriority = 'low' | 'normal' | 'high' | 'urgent';

export type BackendCalendarEventActivityEntry = {
  timestamp: string;
  actor_role: string;
  message: string;
};

export type BackendCalendarEvent = {
  id: string;
  title: string;
  event_type: BackendCalendarEventType;
  customer_name?: string | null;
  location?: string | null;
  assigned_technician_id?: string | null;
  assigned_technician_name?: string | null;
  start_at: string;
  end_at: string;
  description?: string | null;
  priority: BackendCalendarEventPriority;
  attachments: string[];
  reminder_email: boolean;
  reminder_sms: boolean;
  reminder_dashboard: boolean;
  internal_notes?: string | null;
  activity_log: BackendCalendarEventActivityEntry[];
  created_by_role: string;
  created_at: string;
  updated_at: string;
};

export type BackendCalendarEventCreatePayload = {
  title: string;
  event_type: BackendCalendarEventType;
  customer_name?: string | null;
  location?: string | null;
  assigned_technician_id?: string | null;
  start_at: string;
  end_at: string;
  description?: string | null;
  priority?: BackendCalendarEventPriority;
  attachments?: string[];
  reminder_email?: boolean;
  reminder_sms?: boolean;
  reminder_dashboard?: boolean;
  internal_notes?: string | null;
};

export type BackendCalendarEventUpdatePayload = {
  title?: string;
  event_type?: BackendCalendarEventType;
  customer_name?: string | null;
  location?: string | null;
  assigned_technician_id?: string | null;
  start_at?: string;
  end_at?: string;
  description?: string | null;
  priority?: BackendCalendarEventPriority;
  attachments?: string[];
  reminder_email?: boolean;
  reminder_sms?: boolean;
  reminder_dashboard?: boolean;
  internal_notes?: string | null;
};

export type BackendInvoiceLineItem = {
  id: string;
  job_id?: string | null;
  product_service: string;
  description?: string | null;
  quantity: string | number;
  qty: string | number;
  rate: string | number;
  amount: string | number;
  tax_code: string;
  tax_rate: string | number;
  tax_amount: string | number;
  line_order: number;
};

export type BackendInvoiceLineItemPayload = {
  product_service: string;
  qb_item_id?: string | null;
  description?: string | null;
  quantity?: string | number;
  qty?: string | number;
  rate: string | number;
  tax_code: string;
  tax_rate?: string | number | null;
  job_id?: string | null;
};

export type BackendInvoice = {
  id: string;
  invoice_number: string;
  job_code?: string | null;
  dealership_name?: string | null;
  technician_name?: string | null;
  company_info?: BackendInvoiceBrandingSettings | null;
  bill_to?: {
    name?: string | null;
    street?: string | null;
    city?: string | null;
    state?: string | null;
    zip_code?: string | null;
  } | null;
  ship_to?: {
    name?: string | null;
    street?: string | null;
    city?: string | null;
    state?: string | null;
    zip_code?: string | null;
  } | null;
  invoice_date: string;
  terms: 'NET_15' | 'NET_30' | 'CUSTOM';
  custom_term_days?: number | null;
  due_date: string;
  subtotal: string | number;
  sales_tax_total?: string | number | null;
  sales_tax: string | number;
  shipping: string | number;
  total: string | number;
  customer_message?: string | null;
  approval_note?: string | null;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  payment_recorded_at?: string | null;
  voided_at?: string | null;
  created_at: string;
  updated_at: string;
  line_items: BackendInvoiceLineItem[];
};

export type BackendPendingInvoiceApproval = {
  job_id: string;
  job_code: string;
  dealership_name: string;
  technician_name?: string | null;
  service_summary: string;
  vehicle_summary: string;
  completed_at?: string | null;
  estimated_subtotal: string | number;
  estimated_sales_tax: string | number;
  estimated_total: string | number;
  invoice_state: 'pending_approval';
  allowed_actions: string[];
  services: Array<{
    id: string;
    name: string;
    qb_item_id?: string | null;
    quantity: string | number;
    price: string | number;
    total: string | number;
    source?: string | null;
    notes?: string | null;
  }>;
  items: Array<{
    id: string;
    description: string;
    quantity: string | number;
    unit_price: string | number;
    total: string | number;
  }>;
  bill_to?: {
    name?: string | null;
    street?: string | null;
    city?: string | null;
    state?: string | null;
    zip_code?: string | null;
  } | null;
  ship_to?: {
    name?: string | null;
    street?: string | null;
    city?: string | null;
    state?: string | null;
    zip_code?: string | null;
  } | null;
};

export type BackendPendingInvoiceApprovalIssue = {
  job_id: string;
  job_code: string;
  dealership_name: string;
  technician_name?: string | null;
  service_summary: string;
  vehicle_summary: string;
  completed_at?: string | null;
  blocking_reasons: string[];
};

export type BackendReportsKpis = {
  jobs_created: number;
  jobs_completed: number;
  avg_completion_minutes: number;
  technician_utilization: number;
  invoice_total: number;
  pending_approvals: number;
};

export type BackendDispatchStatusRow = {
  status: string;
  count: number;
  percentage: number;
};

export type BackendInvoiceStatusRow = {
  state: string;
  count: number;
  total_amount: number;
  is_critical: boolean;
};

export type BackendTechnicianPerformanceRow = {
  id: string;
  name: string;
  jobs_assigned: number;
  jobs_completed: number;
  avg_completion_time: string;
  delays_count: number;
  refusals_count: number;
  revenue_generated: number;
};

export type BackendDealershipPerformanceRow = {
  id: string;
  name: string;
  jobs_created: number;
  jobs_completed: number;
  avg_resolution_time: string;
  invoice_total: number;
  attention_flags: number;
};

export type BackendInvoicingDetailRow = {
  technician: string;
  approved_amount: number;
  average_invoice: number;
  growth_percentage?: number | null;
};

export type BackendReportsOverview = {
  generated_at: string;
  from_date: string;
  to_date: string;
  current_period_invoice_count: number;
  revenue_delta: number;
  kpis: BackendReportsKpis;
  dispatch_performance: BackendDispatchStatusRow[];
  invoice_performance: BackendInvoiceStatusRow[];
  technician_performance: BackendTechnicianPerformanceRow[];
  dealership_performance: BackendDealershipPerformanceRow[];
  invoicing_detail_rows: BackendInvoicingDetailRow[];
};

export function getStoredAdminToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const raw = window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
  return raw && raw.trim() ? raw : null;
}

export function setStoredAdminToken(token: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
}

export function clearStoredAdminToken(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
}

export function getStoredTechnicianToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const raw = window.localStorage.getItem(TECHNICIAN_TOKEN_STORAGE_KEY);
  return raw && raw.trim() ? raw : null;
}

export function setStoredTechnicianToken(token: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(TECHNICIAN_TOKEN_STORAGE_KEY, token);
}

export function clearStoredTechnicianToken(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.removeItem(TECHNICIAN_TOKEN_STORAGE_KEY);
}

async function tryRefreshAdminToken(expiredToken: string): Promise<string | null> {
  const currentAdminToken = getStoredAdminToken();
  if (currentAdminToken && currentAdminToken === expiredToken) {
    clearStoredAdminToken();
  }
  return null;
}

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
      // ignore and keep fallback
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
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (response.status === 401 && options.token) {
    const refreshedToken = await tryRefreshAdminToken(options.token);
    if (refreshedToken) {
      const retryHeaders: Record<string, string> = { ...headers, Authorization: `Bearer ${refreshedToken}` };
      const retryResponse = await fetch(`${API_BASE_URL}${path}`, {
        method: options.method ?? 'GET',
        headers: retryHeaders,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      });
      if (retryResponse.ok) {
        return retryResponse.json() as Promise<T>;
      }
      // Continue with regular error handling below using retry response.
      let detail = `Request failed (${retryResponse.status})`;
      try {
        const payload = await retryResponse.json() as ErrorPayload;
        if (payload?.detail) {
          detail = extractErrorDetail(payload.detail, detail);
        }
      } catch {
        // Keep generic error if backend didn't return JSON.
      }
      throw new Error(detail);
    }
  }

  if (!response.ok) {
    let detail = `Request failed (${response.status})`;
    try {
      const payload = await response.json() as ErrorPayload;
      if (payload?.detail) {
        detail = extractErrorDetail(payload.detail, detail);
      }
    } catch {
      // Keep generic error if backend didn't return JSON.
    }
    throw new Error(detail);
  }

  return response.json() as Promise<T>;
}

export async function fetchDevAdminToken(payload: {
  email: string;
  password: string;
}): Promise<DevAdminTokenResponse> {
  return requestJson<DevAdminTokenResponse>('/auth/admin-token', {
    method: 'POST',
    body: payload,
  });
}

export async function fetchDevTechnicianToken(payload: {
  email: string;
  password: string;
}): Promise<DevTechnicianTokenResponse> {
  return requestJson<DevTechnicianTokenResponse>('/auth/technician-token', {
    method: 'POST',
    body: payload,
  });
}

export async function fetchAdminTechnicians(token: string): Promise<BackendTechnicianListItem[]> {
  return requestJson<BackendTechnicianListItem[]>('/admin/technicians', {
    token,
  });
}

export async function fetchAdminTechnicianJobsFeed(
  token: string,
  technicianId: string,
): Promise<BackendTechnicianJobFeed> {
  return requestJson<BackendTechnicianJobFeed>(`/admin/technicians/${technicianId}/jobs-feed`, {
    token,
  });
}

export async function fetchAdminJobs(token: string): Promise<BackendAdminJob[]> {
  return requestJson<BackendAdminJob[]>('/admin/jobs', {
    token,
  });
}

export async function createAdminJob(
  token: string,
  payload: {
    job_code?: string | null;
    dealership_name: string;
    service_name?: string;
    service_names?: string[];
    vehicle_summary: string;
    pre_assigned_technician_id?: string | null;
    requested_service_date?: string | null;
    requested_service_time?: string | null;
  },
): Promise<BackendAdminJob> {
  return requestJson<BackendAdminJob>('/admin/jobs', {
    method: 'POST',
    token,
    body: payload,
  });
}

export async function updateAdminJob(
  token: string,
  jobId: string,
  payload: {
    dealership_name?: string;
    service_name?: string;
    service_names?: string[];
    vehicle_summary?: string;
    requested_service_date?: string | null;
    requested_service_time?: string | null;
  },
): Promise<BackendAdminJob> {
  return requestJson<BackendAdminJob>(`/admin/jobs/${jobId}`, {
    method: 'PATCH',
    token,
    body: payload,
  });
}

export async function updateAdminJobAssignment(
  token: string,
  jobId: string,
  payload: { assigned_technician_id: string | null },
): Promise<BackendAdminJob> {
  return requestJson<BackendAdminJob>(`/admin/jobs/${jobId}/assignment`, {
    method: 'PATCH',
    token,
    body: payload,
  });
}

export async function confirmAdminJob(
  token: string,
  jobId: string,
): Promise<BackendAdminJob> {
  return requestJson<BackendAdminJob>(`/admin/jobs/${jobId}/confirm`, {
    method: 'POST',
    token,
  });
}

export async function deleteAdminJob(token: string, jobId: string): Promise<{ status: string }> {
  return requestJson<{ status: string }>(`/admin/jobs/${jobId}`, {
    method: 'DELETE',
    token,
  });
}

export async function updateAdminTechnician(
  token: string,
  technicianId: string,
  payload: {
    name?: string;
    email?: string;
    phone?: string;
    password?: string;
    status?: 'active' | 'deactivated';
    manual_availability?: boolean;
  },
): Promise<BackendTechnicianListItem> {
  return requestJson<BackendTechnicianListItem>(`/admin/technicians/${technicianId}`, {
    method: 'PUT',
    token,
    body: payload,
  });
}

export async function createTechnicianSignupRequest(payload: {
  name: string;
  email: string;
  phone?: string;
  password: string;
}): Promise<BackendSignupRequest> {
  return requestJson<BackendSignupRequest>('/auth/technician-signup-request', {
    method: 'POST',
    body: payload,
  });
}

export async function fetchAdminTechnicianSignupRequests(
  token: string,
  status: 'pending' | 'approved' | 'rejected' | 'all' = 'all',
): Promise<BackendSignupRequest[]> {
  const suffix = status === 'all' ? '' : `?status=${status}`;
  return requestJson<BackendSignupRequest[]>(`/admin/technician-signup-requests${suffix}`, { token });
}

export async function approveAdminTechnicianSignupRequest(
  token: string,
  requestId: string,
): Promise<BackendSignupRequest> {
  return requestJson<BackendSignupRequest>(`/admin/technician-signup-requests/${requestId}/approve`, {
    method: 'POST',
    token,
  });
}

export async function rejectAdminTechnicianSignupRequest(
  token: string,
  requestId: string,
  reason?: string,
): Promise<BackendSignupRequest> {
  return requestJson<BackendSignupRequest>(`/admin/technician-signup-requests/${requestId}/reject`, {
    method: 'POST',
    token,
    body: { reason },
  });
}

export async function fetchAdminDealerships(token: string): Promise<BackendDealership[]> {
  return requestJson<BackendDealership[]>('/admin/dealerships', { token });
}

export async function fetchAdminServices(
  token: string,
  includeArchived = true,
): Promise<BackendServiceCatalogItem[]> {
  const suffix = `?include_archived=${includeArchived ? 'true' : 'false'}`;
  return requestJson<BackendServiceCatalogItem[]>(`/admin/services${suffix}`, { token });
}

export async function fetchServicesCatalog(token: string): Promise<BackendServiceCatalogItem[]> {
  return requestJson<BackendServiceCatalogItem[]>('/services', { token });
}

export async function createAdminService(
  token: string,
  payload: {
    code: string;
    name: string;
    category: string;
    default_price: number;
    approval_required?: boolean;
    status?: 'active' | 'archived';
    notes?: string | null;
  },
): Promise<BackendServiceCatalogItem> {
  return requestJson<BackendServiceCatalogItem>('/admin/services', {
    method: 'POST',
    token,
    body: payload,
  });
}

export async function updateAdminService(
  token: string,
  serviceId: string,
  payload: {
    code?: string;
    name?: string;
    category?: string;
    default_price?: number;
    approval_required?: boolean;
    notes?: string | null;
  },
): Promise<BackendServiceCatalogItem> {
  return requestJson<BackendServiceCatalogItem>(`/admin/services/${serviceId}`, {
    method: 'PUT',
    token,
    body: payload,
  });
}

export async function updateAdminServiceStatus(
  token: string,
  serviceId: string,
  status: 'active' | 'archived',
): Promise<BackendServiceCatalogItem> {
  return requestJson<BackendServiceCatalogItem>(`/admin/services/${serviceId}/status`, {
    method: 'PATCH',
    token,
    body: { status },
  });
}

export async function createAdminDealership(
  token: string,
  payload: {
    code?: string;
    name: string;
    phone?: string;
    email?: string;
    address?: string;
    city?: string;
    postal_code?: string;
    notes?: string;
  },
): Promise<BackendDealership> {
  return requestJson<BackendDealership>('/admin/dealerships', {
    method: 'POST',
    token,
    body: payload,
  });
}

export async function updateAdminDealership(
  token: string,
  dealershipId: string,
  payload: {
    name?: string;
    phone?: string;
    email?: string;
    address?: string;
    city?: string;
    postal_code?: string;
    notes?: string;
    status?: 'active' | 'inactive';
  },
): Promise<BackendDealership> {
  return requestJson<BackendDealership>(`/admin/dealerships/${dealershipId}`, {
    method: 'PUT',
    token,
    body: payload,
  });
}

export async function updateAdminDealershipStatus(
  token: string,
  dealershipId: string,
  status: 'active' | 'inactive',
): Promise<BackendDealership> {
  return requestJson<BackendDealership>(`/admin/dealerships/${dealershipId}/status`, {
    method: 'PATCH',
    token,
    body: { status },
  });
}

export async function fetchAdminInvoiceBrandingSettings(
  token: string,
): Promise<BackendInvoiceBrandingSettings> {
  return requestJson<BackendInvoiceBrandingSettings>('/admin/settings/invoice-branding', {
    token,
  });
}

export async function updateAdminInvoiceBrandingSettings(
  token: string,
  payload: BackendInvoiceBrandingSettings,
): Promise<BackendInvoiceBrandingSettings> {
  return requestJson<BackendInvoiceBrandingSettings>('/admin/settings/invoice-branding', {
    method: 'PUT',
    token,
    body: payload,
  });
}

export async function updateAdminPassword(
  token: string,
  payload: {
    current_password: string;
    new_password: string;
  },
): Promise<BackendAdminPasswordChangeResponse> {
  return requestJson<BackendAdminPasswordChangeResponse>('/admin/settings/admin-password', {
    method: 'POST',
    token,
    body: payload,
  });
}

export async function requestForgotPasswordOtp(
  payload: { email: string },
): Promise<BackendForgotPasswordResponse> {
  return requestJson<BackendForgotPasswordResponse>('/auth/forgot-password', {
    method: 'POST',
    body: payload,
  });
}

export async function verifyForgotPasswordOtp(
  payload: { email: string; otp: string },
): Promise<BackendVerifyOtpResponse> {
  return requestJson<BackendVerifyOtpResponse>('/auth/verify-otp', {
    method: 'POST',
    body: payload,
  });
}

export async function resetPasswordWithOtp(
  payload: { reset_token: string; new_password: string },
): Promise<BackendResetPasswordResponse> {
  return requestJson<BackendResetPasswordResponse>('/auth/reset-password', {
    method: 'POST',
    body: payload,
  });
}

export async function fetchAdminCredentialSettings(
  token: string,
): Promise<BackendAdminCredentialSettings> {
  return requestJson<BackendAdminCredentialSettings>('/admin/settings/admin-credentials', {
    token,
  });
}

export async function updateAdminCredentialSettings(
  token: string,
  payload: {
    admin_email: string;
    recovery_email: string;
    current_password: string;
    new_password?: string;
  },
): Promise<BackendAdminCredentialSettings> {
  return requestJson<BackendAdminCredentialSettings>('/admin/settings/admin-credentials', {
    method: 'PUT',
    token,
    body: payload,
  });
}

export async function fetchAdminPriorityRules(
  token: string,
): Promise<BackendPriorityRule[]> {
  return requestJson<BackendPriorityRule[]>('/admin/settings/priority-rules', {
    token,
  });
}

export async function createAdminPriorityRule(
  token: string,
  payload: {
    description: string;
    dealership_id: string;
    service_id?: string | null;
    target_urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    ranking_score: number;
    is_active?: boolean;
  },
): Promise<BackendPriorityRule> {
  return requestJson<BackendPriorityRule>('/admin/settings/priority-rules', {
    method: 'POST',
    token,
    body: payload,
  });
}

export async function updateAdminPriorityRule(
  token: string,
  ruleId: string,
  payload: {
    description?: string;
    dealership_id?: string;
    service_id?: string | null;
    target_urgency?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    ranking_score?: number;
    is_active?: boolean;
  },
): Promise<BackendPriorityRule> {
  return requestJson<BackendPriorityRule>(`/admin/settings/priority-rules/${ruleId}`, {
    method: 'PATCH',
    token,
    body: payload,
  });
}

export async function deleteAdminPriorityRule(
  token: string,
  ruleId: string,
): Promise<{ status: string }> {
  return requestJson<{ status: string }>(`/admin/settings/priority-rules/${ruleId}`, {
    method: 'DELETE',
    token,
  });
}

export async function fetchInvoices(token: string): Promise<BackendInvoice[]> {
  return requestJson<BackendInvoice[]>('/invoices', { token });
}

export async function createInvoice(
  token: string,
  payload: {
    dispatch_job_ids?: string[];
    line_items?: BackendInvoiceLineItemPayload[];
    replace_dispatch_line_items?: boolean;
    terms?: 'NET_15' | 'NET_30' | 'CUSTOM';
    custom_term_days?: number;
    shipping?: string | number;
    customer_message?: string;
    approval_note?: string;
    status?: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  },
): Promise<BackendInvoice> {
  return requestJson<BackendInvoice>('/invoices', {
    method: 'POST',
    token,
    body: payload,
  });
}

export async function fetchPendingInvoiceApprovals(token: string): Promise<BackendPendingInvoiceApproval[]> {
  return requestJson<BackendPendingInvoiceApproval[]>('/invoices/pending-approvals', { token });
}

export async function fetchPendingInvoiceApprovalIssues(token: string): Promise<BackendPendingInvoiceApprovalIssue[]> {
  return requestJson<BackendPendingInvoiceApprovalIssue[]>('/invoices/pending-approval-issues', { token });
}

export async function savePendingInvoiceApprovalDraft(
  token: string,
  jobId: string,
  payload: {
    line_items: BackendInvoiceLineItemPayload[];
  },
): Promise<BackendPendingInvoiceApproval> {
  return requestJson<BackendPendingInvoiceApproval>(`/invoices/pending-approvals/${jobId}/draft`, {
    method: 'PUT',
    token,
    body: payload,
  });
}

export async function fetchTechnicianMeProfile(token: string): Promise<BackendTechnicianProfile> {
  return requestJson<BackendTechnicianProfile>('/technicians/me', { token });
}

export async function fetchTechnicianJobsFeed(token: string): Promise<BackendTechnicianJobFeed> {
  return requestJson<BackendTechnicianJobFeed>('/technicians/me/jobs-feed', { token });
}

export async function startTechnicianMyJob(
  token: string,
  jobId: string,
): Promise<BackendTechnicianJobActionResponse> {
  return requestJson<BackendTechnicianJobActionResponse>(`/technicians/me/jobs/${jobId}/start`, {
    method: 'POST',
    token,
  });
}

export async function acceptTechnicianMyJob(
  token: string,
  jobId: string,
): Promise<BackendTechnicianJobActionResponse> {
  return requestJson<BackendTechnicianJobActionResponse>(`/technicians/me/jobs/${jobId}/accept`, {
    method: 'POST',
    token,
  });
}

export async function completeTechnicianMyJob(
  token: string,
  jobId: string,
): Promise<BackendTechnicianJobActionResponse> {
  return requestJson<BackendTechnicianJobActionResponse>(`/technicians/me/jobs/${jobId}/complete`, {
    method: 'POST',
    token,
  });
}

export async function delayTechnicianMyJob(
  token: string,
  jobId: string,
  payload: { minutes?: number; note?: string },
): Promise<BackendTechnicianJobActionResponse> {
  return requestJson<BackendTechnicianJobActionResponse>(`/technicians/me/jobs/${jobId}/delay`, {
    method: 'POST',
    token,
    body: payload,
  });
}

export async function addTechnicianMyJobService(
  token: string,
  jobId: string,
  payload: { service_name: string; notes?: string },
): Promise<BackendTechnicianJobFeedItem> {
  return requestJson<BackendTechnicianJobFeedItem>(`/technicians/me/jobs/${jobId}/services`, {
    method: 'POST',
    token,
    body: payload,
  });
}

export async function updateTechnicianMyJobService(
  token: string,
  jobId: string,
  serviceId: string,
  payload: { service_name: string; notes?: string },
): Promise<BackendTechnicianJobFeedItem> {
  return requestJson<BackendTechnicianJobFeedItem>(`/technicians/me/jobs/${jobId}/services/${serviceId}`, {
    method: 'PATCH',
    token,
    body: payload,
  });
}

export async function removeTechnicianMyJobService(
  token: string,
  jobId: string,
  serviceId: string,
): Promise<BackendTechnicianJobFeedItem> {
  return requestJson<BackendTechnicianJobFeedItem>(`/technicians/me/jobs/${jobId}/services/${serviceId}`, {
    method: 'DELETE',
    token,
  });
}

export async function refuseTechnicianMyJob(
  token: string,
  jobId: string,
  payload: { reason?: string; comment?: string },
): Promise<BackendTechnicianJobActionResponse> {
  return requestJson<BackendTechnicianJobActionResponse>(`/technicians/me/jobs/${jobId}/refuse`, {
    method: 'POST',
    token,
    body: payload,
  });
}

export async function acceptTechnicianJob(
  token: string,
  technicianId: string,
  jobId: string,
): Promise<{ message: string; job_id: string; status: string }> {
  return requestJson<{ message: string; job_id: string; status: string }>(`/technicians/${technicianId}/accept/${jobId}`, {
    method: 'POST',
    token,
  });
}

export async function rejectTechnicianJob(
  token: string,
  technicianId: string,
  jobId: string,
  reason: string,
): Promise<{ status: string; message: string }> {
  return requestJson<{ status: string; message: string }>(`/technicians/${technicianId}/reject/${jobId}`, {
    method: 'POST',
    token,
    body: { reason },
  });
}

export async function updateTechnicianMeProfile(
  token: string,
  payload: {
    full_name: string;
    phone?: string | null;
    profile_picture_url?: string | null;
  },
): Promise<BackendTechnicianProfile> {
  return requestJson<BackendTechnicianProfile>('/technicians/me', {
    method: 'PUT',
    token,
    body: payload,
  });
}

export async function updateTechnicianMePassword(
  token: string,
  payload: {
    current_password: string;
    new_password: string;
  },
): Promise<BackendTechnicianPasswordChangeResponse> {
  return requestJson<BackendTechnicianPasswordChangeResponse>('/technicians/me/password', {
    method: 'POST',
    token,
    body: payload,
  });
}

export async function updateTechnicianMeAvailability(
  token: string,
  payload: {
    working_days: number[];
    working_hours_start: string;
    working_hours_end: string;
    after_hours_enabled: boolean;
    out_of_office_ranges: Array<{ start_date: string; end_date: string; note?: string | null }>;
  },
): Promise<BackendTechnicianProfile> {
  return requestJson<BackendTechnicianProfile>('/technicians/me/availability', {
    method: 'PUT',
    token,
    body: payload,
  });
}

export async function requestTechnicianEmailChange(
  token: string,
  payload: { requested_email: string },
): Promise<BackendEmailChangeRequest> {
  return requestJson<BackendEmailChangeRequest>('/technicians/me/email-change-request', {
    method: 'POST',
    token,
    body: payload,
  });
}

export async function fetchTechnicianEmailChangeRequests(token: string): Promise<BackendEmailChangeRequest[]> {
  return requestJson<BackendEmailChangeRequest[]>('/technicians/me/email-change-requests', {
    token,
  });
}

export async function fetchAdminEmailChangeRequests(
  token: string,
  status?: 'PENDING' | 'APPROVED' | 'REJECTED',
): Promise<BackendEmailChangeRequest[]> {
  const suffix = status ? `?status=${encodeURIComponent(status)}` : '';
  return requestJson<BackendEmailChangeRequest[]>(`/admin/email-change-requests${suffix}`, { token });
}

export async function approveAdminEmailChangeRequest(
  token: string,
  requestId: string,
  remarks?: string,
): Promise<BackendEmailChangeRequest> {
  return requestJson<BackendEmailChangeRequest>(`/admin/email-change-requests/${requestId}/approve`, {
    method: 'POST',
    token,
    body: { remarks },
  });
}

export async function rejectAdminEmailChangeRequest(
  token: string,
  requestId: string,
  remarks?: string,
): Promise<BackendEmailChangeRequest> {
  return requestJson<BackendEmailChangeRequest>(`/admin/email-change-requests/${requestId}/reject`, {
    method: 'POST',
    token,
    body: { remarks },
  });
}

export async function fetchAdminCalendarEvents(
  token: string,
  params?: {
    start_at?: string;
    end_at?: string;
    technician_id?: string;
    event_type?: BackendCalendarEventType;
  },
): Promise<BackendCalendarEvent[]> {
  const search = new URLSearchParams();
  if (params?.start_at) search.set('start_at', params.start_at);
  if (params?.end_at) search.set('end_at', params.end_at);
  if (params?.technician_id) search.set('technician_id', params.technician_id);
  if (params?.event_type) search.set('event_type', params.event_type);
  const suffix = search.toString() ? `?${search.toString()}` : '';
  return requestJson<BackendCalendarEvent[]>(`/admin/calendar/events${suffix}`, { token });
}

export async function createAdminCalendarEvent(
  token: string,
  payload: BackendCalendarEventCreatePayload,
): Promise<BackendCalendarEvent> {
  return requestJson<BackendCalendarEvent>('/admin/calendar/events', {
    method: 'POST',
    token,
    body: payload,
  });
}

export async function updateAdminCalendarEvent(
  token: string,
  eventId: string,
  payload: BackendCalendarEventUpdatePayload,
): Promise<BackendCalendarEvent> {
  return requestJson<BackendCalendarEvent>(`/admin/calendar/events/${eventId}`, {
    method: 'PATCH',
    token,
    body: payload,
  });
}

export async function rescheduleAdminCalendarEvent(
  token: string,
  eventId: string,
  payload: {
    start_at: string;
    end_at: string;
    assigned_technician_id?: string | null;
  },
): Promise<BackendCalendarEvent> {
  return requestJson<BackendCalendarEvent>(`/admin/calendar/events/${eventId}/schedule`, {
    method: 'PATCH',
    token,
    body: payload,
  });
}

export async function addAdminCalendarEventNote(
  token: string,
  eventId: string,
  note: string,
): Promise<BackendCalendarEvent> {
  return requestJson<BackendCalendarEvent>(`/admin/calendar/events/${eventId}/notes`, {
    method: 'POST',
    token,
    body: { note },
  });
}

export async function deleteAdminCalendarEvent(
  token: string,
  eventId: string,
): Promise<{ status: string }> {
  return requestJson<{ status: string }>(`/admin/calendar/events/${eventId}`, {
    method: 'DELETE',
    token,
  });
}

export async function fetchAdminReportsOverview(
  token: string,
  params?: { from_date?: string; to_date?: string },
): Promise<BackendReportsOverview> {
  const search = new URLSearchParams();
  if (params?.from_date) search.set('from_date', params.from_date);
  if (params?.to_date) search.set('to_date', params.to_date);
  const suffix = search.toString() ? `?${search.toString()}` : '';
  return requestJson<BackendReportsOverview>(`/admin/reports/overview${suffix}`, { token });
}
