// SM2 Dispatch - Type Definitions

// User Roles
export type UserRole = 'admin' | 'technician';

// Job Status
export type JobStatus =
  | 'UNKNOWN'
  | 'ADMIN_PREVIEW'
  | 'READY_FOR_TECH'
  | 'PENDING_ADMIN_CONFIRMATION'
  | 'PENDING_REVIEW'
  | 'PENDING'
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'DELAYED'
  | 'COMPLETED'
  | 'CANCELLED';

// Invoice State
export type InvoiceState =
  | 'NOT_STARTED'
  | 'PENDING_APPROVAL'
  | 'CREATING'
  | 'CREATED'
  | 'VERIFIED'
  | 'NEEDS_MANUAL_VERIFICATION'
  | 'FAILED';

// Urgency Level
export type UrgencyLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

// Technician Status
export type TechnicianStatus = 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE';

// Technician Availability
export type TechnicianAvailability = 'AVAILABLE' | 'UNAVAILABLE' | 'BUSY';

// Event Types for Audit Log
export type AuditEventType =
  | 'MESSAGE_RECEIVED'
  | 'PARSED'
  | 'PENDING_REVIEW'
  | 'TECH_ACCEPTED'
  | 'STATUS_CHANGED'
  | 'INVOICE_APPROVAL_REQUESTED'
  | 'INVOICE_APPROVED'
  | 'TASK_CREATED'
  | 'TASK_RESULT'
  | 'INVOICE_CREATED'
  | 'VERIFICATION_RUN'
  | 'TECH_ASSIGNED'
  | 'TECH_REASSIGNED'
  | 'JOB_CANCELLED'
  | 'JOB_UPDATED'
  | 'INVOICE_CREATION_FAILED'
  | 'MANUAL_VERIFICATION_REQUIRED';

// Actor Type
export type ActorType = 'SYSTEM' | 'ADMIN' | 'TECHNICIAN' | 'MAKE_WORKER';

// User Interface
export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatar?: string;
  phone?: string;
  createdAt: string;
  updatedAt: string;
}

// Dealership Interface
export interface Dealership {
  id: string;
  name: string;
  phone?: string;
  email?: string; // Domain Email
  address?: string;
  city?: string;
  postalCode?: string; // Code (Postal Code)
  status: 'ACTIVE' | 'INACTIVE';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// Service Interface
export interface Service {
  id: string;
  code: string;
  name: string;
  defaultPrice: number;
  approvalRequired: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// Technician Interface
export interface Technician {
  id: string;
  userId: string;
  name: string;
  techCode: string;
  phone: string;
  email: string;
  status: TechnicianStatus;
  skills: string[];
  zones: string[];
  workingHours?: {
    monday?: { start: string; end: string };
    tuesday?: { start: string; end: string };
    wednesday?: { start: string; end: string };
    thursday?: { start: string; end: string };
    friday?: { start: string; end: string };
    saturday?: { start: string; end: string };
    sunday?: { start: string; end: string };
  };
  timeOff?: TimeOffEntry[];
  currentJobsCount: number;
  avatar?: string;
  availability: TechnicianAvailability;
  createdAt: string;
  updatedAt: string;
}

// Time Off Entry
export interface TimeOffEntry {
  id: string;
  startDate: string;
  endDate: string;
  reason?: string;
}

// Vehicle Interface
export interface Vehicle {
  id: string;
  make: string;
  model: string;
  year?: number;
  vin?: string;
  stockNumber?: string;
}

// Line Item Interface
export interface LineItem {
  id: string;
  serviceId: string;
  serviceName: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

// Invoice Preview Interface
export interface InvoicePreview {
  id: string;
  lineItems: LineItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  notes?: string;
}

// Job Interface
export interface Job {
  id: string;
  jobCode: string;
  dealershipId: string;
  dealership: Dealership;
  serviceId: string;
  service: Service;
  vehicle?: Vehicle;
  urgency: UrgencyLevel;
  ranking_score?: number;
  applied_rules?: string[];
  status: JobStatus;

  invoiceState: InvoiceState;
  assignedTechnicianId?: string;
  assignedTechnician?: Technician;
  requestedDate?: string;
  parsedConfidence?: number;
  notes?: string;
  invoicePreview?: InvoicePreview;
  accountingInvoiceId?: string;
  accountingInvoiceUrl?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

// Audit Event Interface
export interface AuditEvent {
  id: string;
  jobId?: string;
  jobCode?: string;
  eventType: AuditEventType;
  actorType: ActorType;
  actorId?: string;
  actorName?: string;
  summary: string;
  payload?: Record<string, unknown>;
  createdAt: string;
}

// System Alert Interface
export interface SystemAlert {
  id: string;
  type: 'ERROR' | 'WARNING' | 'INFO';
  title: string;
  message: string;
  dismissible: boolean;
  dismissed?: boolean;
  createdAt: string;
}

// KPI Card Interface
export interface KPICard {
  id: string;
  title: string;
  value: number;
  change?: number;
  changeLabel?: string;
  icon: string;
  filter?: string;
  color: 'blue' | 'green' | 'orange' | 'red' | 'gray';
}

// Report Data Interface
export interface WeeklyReport {
  weekStart: string;
  weekEnd: string;
  jobsCreated: number;
  jobsCompleted: number;
  averageCompletionTime: number; // in hours
  invoiceTotals: number;
  approvalsCount: number;
  technicianPerformance: TechnicianPerformance[];
}

// Technician Performance Interface
export interface TechnicianPerformance {
  technicianId: string;
  technicianName: string;
  jobsCompleted: number;
  averageJobTime: number;
  totalRevenue: number;
}

// Filter Options
export interface JobFilters {
  dateRange?: { start: string; end: string };
  status?: JobStatus[];
  invoiceState?: InvoiceState[];
  dealershipId?: string;
  technicianId?: string;
  urgency?: UrgencyLevel[];
  search?: string;
}

// Pagination Interface
export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Eligible Technician for Assignment
export interface EligibleTechnician {
  technician: Technician;
  skillMatch: number; // 0-100
  zoneMatch: boolean;
  availability: TechnicianAvailability;
  currentWorkload: number;
  priorityRank: number;
}

// Priority Rule Interface
export interface PriorityRule {
  id: string;
  dealershipId: string;
  serviceId?: string; // Optional: e.g., only for 'Engine' work
  vehicleMake?: string; // Optional: e.g., Audi
  urgencyMatch?: UrgencyLevel; // Optional: e.g., if input is HIGH
  targetUrgency: UrgencyLevel;
  rankingScore: number; // Score impact for sorting
  isActive: boolean;

  description: string;
  createdAt: string;
  updatedAt: string;
}

// Job Ranking Score Result
export interface RankingScoreResult {
  score: number;
  finalUrgency: UrgencyLevel;
  appliedRules: string[];
}


// Delay Reason
export interface DelayReason {
  minutes: number;
  note?: string;
}

// Refuse Reason
export interface RefuseReason {
  reason: string;
}
