import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import timeGridPlugin from '@fullcalendar/timegrid';
import type {
  DateSelectArg,
  DatesSetArg,
  EventClickArg,
  EventContentArg,
  EventDropArg,
  EventInput,
} from '@fullcalendar/core';
import {
  Activity,
  AlertTriangle,
  Bell,
  CalendarCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Database,
  Mail,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  StickyNote,
  Truck,
  UserCog,
  Users,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  addAdminCalendarEventNote,
  createAdminCalendarEvent,
  deleteAdminCalendarEvent,
  fetchAdminCalendarEvents,
  fetchAdminJobs,
  fetchAdminTechnicians,
  fetchInvoices,
  getStoredAdminToken,
  rescheduleAdminCalendarEvent,
  updateAdminCalendarEvent,
  updateAdminJob,
  updateAdminJobAssignment,
  type BackendAdminJob,
  type BackendCalendarEvent,
  type BackendCalendarEventActivityEntry,
  type BackendCalendarEventPriority,
  type BackendCalendarEventType,
  type BackendInvoice,
  type BackendTechnicianListItem,
} from '@/lib/backend-api';

import './calendar.css';

const ADMIN_REFRESH_EVENT = 'dispatchiq:admin-refresh';

type CalendarViewMode = 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay';
type CalendarSourceKind = 'calendar' | 'job' | 'invoice';
type CalendarTypeFilter = 'all' | BackendCalendarEventType;

type EventFormState = {
  title: string;
  eventType: BackendCalendarEventType;
  customerName: string;
  location: string;
  technicianId: string;
  startAt: string;
  endAt: string;
  description: string;
  priority: BackendCalendarEventPriority;
  attachments: string;
  internalNotes: string;
  reminderEmail: boolean;
  reminderSms: boolean;
  reminderDashboard: boolean;
};

type CalendarEventVm = {
  id: string;
  source: CalendarSourceKind;
  sourceId: string;
  title: string;
  start: Date;
  end: Date;
  eventType: BackendCalendarEventType;
  technicianId?: string | null;
  technicianName?: string | null;
  customerName?: string | null;
  location?: string | null;
  description?: string | null;
  priority: BackendCalendarEventPriority;
  statusLabel?: string | null;
  activityLog: BackendCalendarEventActivityEntry[];
  reminderEmail: boolean;
  reminderSms: boolean;
  reminderDashboard: boolean;
  attachments: string[];
  internalNotes?: string | null;
  rawCalendarEvent?: BackendCalendarEvent;
  rawJob?: BackendAdminJob;
  rawInvoice?: BackendInvoice;
};

type EventTypeMeta = {
  label: string;
  icon: LucideIcon;
  chipClassName: string;
};

const EVENT_TYPE_META: Record<BackendCalendarEventType, EventTypeMeta> = {
  appointment: {
    label: 'Appointment',
    icon: CalendarCheck,
    chipClassName: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  service_job: {
    label: 'Service Job',
    icon: Wrench,
    chipClassName: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  delivery: {
    label: 'Delivery',
    icon: Truck,
    chipClassName: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  technician_schedule: {
    label: 'Technician Schedule',
    icon: UserCog,
    chipClassName: 'bg-violet-50 text-violet-700 border-violet-200',
  },
  reminder: {
    label: 'Reminder',
    icon: StickyNote,
    chipClassName: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  urgent: {
    label: 'Urgent',
    icon: AlertTriangle,
    chipClassName: 'bg-rose-50 text-rose-700 border-rose-200',
  },
};

const VIEW_OPTIONS: Array<{ value: CalendarViewMode; label: string }> = [
  { value: 'dayGridMonth', label: 'Month' },
  { value: 'timeGridWeek', label: 'Week' },
  { value: 'timeGridDay', label: 'Day' },
];

const PRIORITY_OPTIONS: Array<{ value: BackendCalendarEventPriority; label: string }> = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

const EVENT_TYPE_OPTIONS: BackendCalendarEventType[] = [
  'appointment',
  'service_job',
  'delivery',
  'technician_schedule',
  'reminder',
  'urgent',
];

const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: '2-digit',
  hour: 'numeric',
  minute: '2-digit',
});

const timeFormatter = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
});

const pad = (value: number) => value.toString().padStart(2, '0');

const buildDefaultForm = (prefillStart?: Date, prefillEnd?: Date): EventFormState => {
  const start = prefillStart ? new Date(prefillStart) : new Date();
  const end = prefillEnd
    ? new Date(prefillEnd)
    : new Date(start.getTime() + 60 * 60 * 1000);

  return {
    title: '',
    eventType: 'appointment',
    customerName: '',
    location: '',
    technicianId: '',
    startAt: toLocalDateTimeInputValue(start),
    endAt: toLocalDateTimeInputValue(end),
    description: '',
    priority: 'normal',
    attachments: '',
    internalNotes: '',
    reminderEmail: false,
    reminderSms: false,
    reminderDashboard: true,
  };
};

function toLocalDateTimeInputValue(value: Date): string {
  const year = value.getFullYear();
  const month = pad(value.getMonth() + 1);
  const day = pad(value.getDate());
  const hour = pad(value.getHours());
  const minute = pad(value.getMinutes());
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function toIsoFromLocalInput(inputValue: string): string {
  const parsed = new Date(inputValue);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Please provide valid date and time values.');
  }
  return parsed.toISOString();
}

function toBackendDate(inputValue: Date): string {
  return `${inputValue.getFullYear()}-${pad(inputValue.getMonth() + 1)}-${pad(inputValue.getDate())}`;
}

function toBackendTime(inputValue: Date): string {
  return `${pad(inputValue.getHours())}:${pad(inputValue.getMinutes())}:00`;
}

function parseMaybeDate(value: string | null | undefined): Date | null {
  if (!value) return null;

  const normalized = value.trim();
  if (!normalized) return null;

  const dateCandidate = /^\d{4}-\d{2}-\d{2}$/.test(normalized)
    ? `${normalized}T00:00:00`
    : normalized;
  const parsed = new Date(dateCandidate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseJobStart(row: BackendAdminJob): Date | null {
  if (row.requested_service_date) {
    const timePart = (row.requested_service_time || '09:00:00').slice(0, 8);
    const parsed = new Date(`${row.requested_service_date}T${timePart}`);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return parseMaybeDate(row.created_at);
}

function parseInvoiceDueStart(row: BackendInvoice): Date | null {
  const dueDate = parseMaybeDate(row.due_date);
  if (!dueDate) {
    return null;
  }
  dueDate.setHours(16, 0, 0, 0);
  return dueDate;
}

function formatDateTime(value: Date): string {
  return dateTimeFormatter.format(value);
}

function formatClock(value: Date): string {
  return timeFormatter.format(value);
}

function parseAttachments(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function matchesLocalDay(candidate: Date, day: Date): boolean {
  return (
    candidate.getFullYear() === day.getFullYear()
    && candidate.getMonth() === day.getMonth()
    && candidate.getDate() === day.getDate()
  );
}

function normalizeErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}

function mapCalendarEventRowToVm(row: BackendCalendarEvent): CalendarEventVm {
  return {
    id: `calendar:${row.id}`,
    source: 'calendar',
    sourceId: row.id,
    title: row.title,
    start: new Date(row.start_at),
    end: new Date(row.end_at),
    eventType: row.event_type,
    technicianId: row.assigned_technician_id,
    technicianName: row.assigned_technician_name,
    customerName: row.customer_name,
    location: row.location,
    description: row.description,
    priority: row.priority,
    statusLabel: null,
    activityLog: row.activity_log ?? [],
    reminderEmail: row.reminder_email,
    reminderSms: row.reminder_sms,
    reminderDashboard: row.reminder_dashboard,
    attachments: row.attachments ?? [],
    internalNotes: row.internal_notes,
    rawCalendarEvent: row,
  };
}

function mapJobRowToVm(row: BackendAdminJob): CalendarEventVm | null {
  const start = parseJobStart(row);
  if (!start) {
    return null;
  }
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const serviceName = row.service_names?.[0] || row.service_type || 'Service Job';
  const title = `${row.job_code} · ${serviceName}`;

  return {
    id: `job:${row.id}`,
    source: 'job',
    sourceId: row.id,
    title,
    start,
    end,
    eventType: 'service_job',
    technicianId: row.assigned_technician_id,
    technicianName: row.assigned_technician_name,
    customerName: row.dealership_name,
    location: null,
    description: row.service_names?.join(', ') || row.service_type,
    priority: 'normal',
    statusLabel: row.status,
    activityLog: [],
    reminderEmail: false,
    reminderSms: false,
    reminderDashboard: true,
    attachments: [],
    internalNotes: null,
    rawJob: row,
  };
}

function mapInvoiceRowToVm(row: BackendInvoice): CalendarEventVm | null {
  const start = parseInvoiceDueStart(row);
  if (!start) {
    return null;
  }

  const end = new Date(start.getTime() + 30 * 60 * 1000);
  return {
    id: `invoice:${row.id}`,
    source: 'invoice',
    sourceId: row.id,
    title: `Invoice ${row.invoice_number} due`,
    start,
    end,
    eventType: 'delivery',
    technicianId: null,
    technicianName: row.technician_name,
    customerName: row.dealership_name,
    location: null,
    description: row.customer_message || null,
    priority: row.status === 'overdue' ? 'urgent' : 'normal',
    statusLabel: row.status,
    activityLog: [],
    reminderEmail: false,
    reminderSms: false,
    reminderDashboard: true,
    attachments: [],
    internalNotes: null,
    rawInvoice: row,
  };
}

export default function CalendarPage() {
  const calendarRef = useRef<FullCalendar | null>(null);
  const initialRange = useMemo(
    () => ({
      start: (() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), 1);
      })(),
      end: (() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth() + 1, 1);
      })(),
    }),
    [],
  );
  const [calendarRows, setCalendarRows] = useState<BackendCalendarEvent[]>([]);
  const [jobRows, setJobRows] = useState<BackendAdminJob[]>([]);
  const [invoiceRows, setInvoiceRows] = useState<BackendInvoice[]>([]);
  const [technicianRows, setTechnicianRows] = useState<BackendTechnicianListItem[]>([]);

  const [visibleRange, setVisibleRange] = useState(initialRange);
  const [currentView, setCurrentView] = useState<CalendarViewMode>('dayGridMonth');
  const [currentTitle, setCurrentTitle] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTechnicianFilter, setSelectedTechnicianFilter] = useState<string>('all');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<CalendarTypeFilter>('all');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingCalendarEventId, setEditingCalendarEventId] = useState<string | null>(null);
  const [formState, setFormState] = useState<EventFormState>(() => buildDefaultForm());
  const [savingForm, setSavingForm] = useState(false);

  const [selectedEvent, setSelectedEvent] = useState<CalendarEventVm | null>(null);
  const [selectedTechnicianId, setSelectedTechnicianId] = useState<string>('');
  const [updatingTechnician, setUpdatingTechnician] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const requireToken = useCallback(() => {
    const token = getStoredAdminToken();
    if (!token) {
      throw new Error('Admin session expired. Please sign in again.');
    }
    return token;
  }, []);

  const loadCalendarRows = useCallback(async (range: { start: Date; end: Date }) => {
    const token = requireToken();
    const rows = await fetchAdminCalendarEvents(token, {
      start_at: range.start.toISOString(),
      end_at: range.end.toISOString(),
    });
    setCalendarRows(rows);
  }, [requireToken]);

  const loadReferenceRows = useCallback(async () => {
    const token = requireToken();
    const [technicians, jobs, invoices] = await Promise.all([
      fetchAdminTechnicians(token),
      fetchAdminJobs(token),
      fetchInvoices(token),
    ]);

    setTechnicianRows(technicians);
    setJobRows(jobs);
    setInvoiceRows(invoices);
  }, [requireToken]);

  const refreshAll = useCallback(async (range: { start: Date; end: Date }, withFullLoader = false) => {
    if (withFullLoader) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      await Promise.all([
        loadReferenceRows(),
        loadCalendarRows(range),
      ]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadCalendarRows, loadReferenceRows]);

  useEffect(() => {
    void refreshAll(initialRange, true).catch((error) => {
      toast.error(normalizeErrorMessage(error, 'Unable to load calendar data.'));
    });
  }, [initialRange, refreshAll]);

  useEffect(() => {
    const handleRefresh = () => {
      void refreshAll(visibleRange).catch((error) => {
        toast.error(normalizeErrorMessage(error, 'Unable to refresh calendar data.'));
      });
    };

    window.addEventListener(ADMIN_REFRESH_EVENT, handleRefresh);
    return () => window.removeEventListener(ADMIN_REFRESH_EVENT, handleRefresh);
  }, [refreshAll, visibleRange]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void refreshAll(visibleRange).catch(() => {
        // silence periodic refresh failures
      });
    }, 45000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [refreshAll, visibleRange]);

  const allEvents = useMemo<CalendarEventVm[]>(() => {
    const fromCalendar = calendarRows.map(mapCalendarEventRowToVm);
    const fromJobs = jobRows
      .map(mapJobRowToVm)
      .filter((entry): entry is CalendarEventVm => entry !== null);
    const fromInvoices = invoiceRows
      .map(mapInvoiceRowToVm)
      .filter((entry): entry is CalendarEventVm => entry !== null);

    return [...fromCalendar, ...fromJobs, ...fromInvoices];
  }, [calendarRows, jobRows, invoiceRows]);

  const filteredEvents = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return allEvents.filter((entry) => {
      if (selectedTechnicianFilter !== 'all' && entry.technicianId !== selectedTechnicianFilter) {
        return false;
      }

      if (selectedTypeFilter !== 'all' && entry.eventType !== selectedTypeFilter) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const searchable = [
        entry.title,
        entry.customerName,
        entry.technicianName,
        entry.location,
        entry.description,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchable.includes(normalizedSearch);
    });
  }, [allEvents, searchTerm, selectedTechnicianFilter, selectedTypeFilter]);

  const fullCalendarEvents = useMemo<EventInput[]>(() => {
    return filteredEvents.map((entry) => ({
      id: entry.id,
      title: entry.title,
      start: entry.start,
      end: entry.end,
      editable: entry.source !== 'invoice',
      durationEditable: entry.source !== 'invoice',
      classNames: ['dispatch-fc-event', `dispatch-fc-event-${entry.eventType}`],
      extendedProps: entry,
    }));
  }, [filteredEvents]);

  const todaySchedule = useMemo(() => {
    const today = new Date();
    return filteredEvents
      .filter((entry) => matchesLocalDay(entry.start, today))
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .slice(0, 8);
  }, [filteredEvents]);

  const upcomingAppointments = useMemo(() => {
    const nowDate = new Date();
    return filteredEvents
      .filter((entry) => entry.eventType === 'appointment' && entry.start.getTime() > nowDate.getTime())
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .slice(0, 6);
  }, [filteredEvents]);

  const pendingDeliveries = useMemo(() => {
    const nowDate = new Date();
    return filteredEvents
      .filter((entry) => entry.eventType === 'delivery' && entry.end.getTime() >= nowDate.getTime())
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .slice(0, 6);
  }, [filteredEvents]);

  const technicianAvailability = useMemo(() => {
    const nowDate = new Date();

    const busyTechnicianIds = new Set(
      filteredEvents
        .filter((entry) => {
          if (!entry.technicianId) {
            return false;
          }
          return entry.start.getTime() <= nowDate.getTime() && entry.end.getTime() >= nowDate.getTime();
        })
        .map((entry) => entry.technicianId as string),
    );

    return technicianRows.map((tech) => {
      let status: 'available' | 'busy' | 'off_duty' = 'available';

      if (tech.status !== 'active' || tech.on_leave_now || !tech.effective_availability) {
        status = 'off_duty';
      } else if (busyTechnicianIds.has(tech.id)) {
        status = 'busy';
      }

      return {
        id: tech.id,
        name: tech.name,
        status,
      };
    });
  }, [filteredEvents, technicianRows]);

  const availabilityCounts = useMemo(() => {
    return technicianAvailability.reduce(
      (acc, entry) => {
        if (entry.status === 'available') acc.available += 1;
        if (entry.status === 'busy') acc.busy += 1;
        if (entry.status === 'off_duty') acc.offDuty += 1;
        return acc;
      },
      { available: 0, busy: 0, offDuty: 0 },
    );
  }, [technicianAvailability]);

  useEffect(() => {
    setSelectedTechnicianId(selectedEvent?.technicianId || '');
    setNoteDraft('');
  }, [selectedEvent?.source, selectedEvent?.sourceId]);

  const runCalendarApi = useCallback((fn: (api: ReturnType<FullCalendar['getApi']>) => void) => {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    fn(api);
  }, []);

  const handleViewChange = useCallback((nextView: CalendarViewMode) => {
    setCurrentView(nextView);
    runCalendarApi((api) => api.changeView(nextView));
  }, [runCalendarApi]);

  const handleNavigate = useCallback((action: 'prev' | 'next' | 'today') => {
    runCalendarApi((api) => {
      if (action === 'prev') api.prev();
      if (action === 'next') api.next();
      if (action === 'today') api.today();
    });
  }, [runCalendarApi]);

  const handleDatesSet = useCallback((arg: DatesSetArg) => {
    setCurrentTitle(arg.view.title);

    if (arg.view.type === 'dayGridMonth' || arg.view.type === 'timeGridWeek' || arg.view.type === 'timeGridDay') {
      setCurrentView(arg.view.type);
    }

    const nextRange = { start: arg.start, end: arg.end };
    setVisibleRange(nextRange);

    void loadCalendarRows(nextRange).catch((error) => {
      toast.error(normalizeErrorMessage(error, 'Unable to refresh calendar events for this range.'));
    });
  }, [loadCalendarRows]);

  const openCreateModal = useCallback((prefillStart?: Date, prefillEnd?: Date) => {
    setModalMode('create');
    setEditingCalendarEventId(null);
    setFormState(buildDefaultForm(prefillStart, prefillEnd));
    setModalOpen(true);
  }, []);

  const openEditModal = useCallback((entry: CalendarEventVm) => {
    if (entry.source !== 'calendar' || !entry.rawCalendarEvent) {
      toast.info('Only custom calendar events can be edited here.');
      return;
    }

    const row = entry.rawCalendarEvent;
    setModalMode('edit');
    setEditingCalendarEventId(row.id);
    setFormState({
      title: row.title,
      eventType: row.event_type,
      customerName: row.customer_name || '',
      location: row.location || '',
      technicianId: row.assigned_technician_id || '',
      startAt: toLocalDateTimeInputValue(new Date(row.start_at)),
      endAt: toLocalDateTimeInputValue(new Date(row.end_at)),
      description: row.description || '',
      priority: row.priority,
      attachments: (row.attachments || []).join('\n'),
      internalNotes: row.internal_notes || '',
      reminderEmail: row.reminder_email,
      reminderSms: row.reminder_sms,
      reminderDashboard: row.reminder_dashboard,
    });
    setModalOpen(true);
  }, []);

  const handleDateSelect = useCallback((selection: DateSelectArg) => {
    openCreateModal(selection.start, selection.end);
    runCalendarApi((api) => api.unselect());
  }, [openCreateModal, runCalendarApi]);

  const handleEventClick = useCallback((arg: EventClickArg) => {
    const entry = arg.event.extendedProps as CalendarEventVm;
    setSelectedEvent(entry);
  }, []);

  const handleSaveCalendarEvent = useCallback(async () => {
    setSavingForm(true);

    try {
      const token = requireToken();
      const startAtIso = toIsoFromLocalInput(formState.startAt);
      const endAtIso = toIsoFromLocalInput(formState.endAt);

      if (new Date(endAtIso).getTime() <= new Date(startAtIso).getTime()) {
        throw new Error('End date/time must be after start date/time.');
      }

      const payload = {
        title: formState.title.trim(),
        event_type: formState.eventType,
        customer_name: formState.customerName.trim() || null,
        location: formState.location.trim() || null,
        assigned_technician_id: formState.technicianId || null,
        start_at: startAtIso,
        end_at: endAtIso,
        description: formState.description.trim() || null,
        priority: formState.priority,
        attachments: parseAttachments(formState.attachments),
        reminder_email: formState.reminderEmail,
        reminder_sms: formState.reminderSms,
        reminder_dashboard: formState.reminderDashboard,
        internal_notes: formState.internalNotes.trim() || null,
      };

      if (!payload.title) {
        throw new Error('Event title is required.');
      }

      if (modalMode === 'create') {
        await createAdminCalendarEvent(token, payload);
        toast.success('Appointment created successfully.');
      } else if (editingCalendarEventId) {
        await updateAdminCalendarEvent(token, editingCalendarEventId, payload);
        toast.success('Calendar event updated successfully.');
      }

      setModalOpen(false);
      await refreshAll(visibleRange);
    } catch (error) {
      toast.error(normalizeErrorMessage(error, 'Unable to save calendar event.'));
    } finally {
      setSavingForm(false);
    }
  }, [
    editingCalendarEventId,
    formState,
    modalMode,
    refreshAll,
    requireToken,
    visibleRange,
  ]);

  const handleDeleteCalendarEvent = useCallback(async () => {
    if (!editingCalendarEventId) {
      return;
    }

    if (!window.confirm('Delete this calendar event?')) {
      return;
    }

    try {
      const token = requireToken();
      await deleteAdminCalendarEvent(token, editingCalendarEventId);
      toast.success('Calendar event deleted.');
      setModalOpen(false);
      setSelectedEvent(null);
      await refreshAll(visibleRange);
    } catch (error) {
      toast.error(normalizeErrorMessage(error, 'Unable to delete calendar event.'));
    }
  }, [editingCalendarEventId, refreshAll, requireToken, visibleRange]);

  const handleScheduleMutation = useCallback(async (entry: CalendarEventVm, start: Date, end: Date) => {
    const token = requireToken();

    if (entry.source === 'invoice') {
      throw new Error('Invoice reminders are read-only.');
    }

    if (entry.source === 'calendar') {
      await rescheduleAdminCalendarEvent(token, entry.sourceId, {
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        assigned_technician_id: entry.technicianId || null,
      });
      return;
    }

    await updateAdminJob(token, entry.sourceId, {
      requested_service_date: toBackendDate(start),
      requested_service_time: toBackendTime(start),
    });
  }, [requireToken]);

  const handleEventDrop = useCallback((arg: EventDropArg) => {
    const entry = arg.event.extendedProps as CalendarEventVm;
    const start = arg.event.start;
    const end = arg.event.end || (start ? new Date(start.getTime() + 60 * 60 * 1000) : null);

    if (!start || !end) {
      arg.revert();
      return;
    }

    void (async () => {
      try {
        await handleScheduleMutation(entry, start, end);
        toast.success('Schedule updated.');
        await refreshAll(visibleRange);
      } catch (error) {
        arg.revert();
        toast.error(normalizeErrorMessage(error, 'Unable to reschedule this event.'));
      }
    })();
  }, [handleScheduleMutation, refreshAll, visibleRange]);

  const handleEventResize = useCallback((arg: any) => {
    const entry = arg.event.extendedProps as CalendarEventVm;
    const start = arg.event.start;
    const end = arg.event.end;

    if (!start || !end) {
      arg.revert();
      return;
    }

    void (async () => {
      try {
        await handleScheduleMutation(entry, start, end);
        toast.success('Event duration updated.');
        await refreshAll(visibleRange);
      } catch (error) {
        arg.revert();
        toast.error(normalizeErrorMessage(error, 'Unable to resize this event.'));
      }
    })();
  }, [handleScheduleMutation, refreshAll, visibleRange]);

  const handleApplyTechnicianReassign = useCallback(async () => {
    if (!selectedEvent || selectedEvent.source === 'invoice') {
      return;
    }

    setUpdatingTechnician(true);

    try {
      const token = requireToken();
      const nextTechnician = selectedTechnicianId || null;

      if (selectedEvent.source === 'calendar') {
        await updateAdminCalendarEvent(token, selectedEvent.sourceId, {
          assigned_technician_id: nextTechnician,
        });
      } else {
        await updateAdminJobAssignment(token, selectedEvent.sourceId, {
          assigned_technician_id: nextTechnician,
        });
      }

      toast.success('Technician assignment updated.');
      await refreshAll(visibleRange);
    } catch (error) {
      toast.error(normalizeErrorMessage(error, 'Unable to update technician assignment.'));
    } finally {
      setUpdatingTechnician(false);
    }
  }, [requireToken, refreshAll, selectedEvent, selectedTechnicianId, visibleRange]);

  const handleAddNote = useCallback(async () => {
    if (!selectedEvent || selectedEvent.source !== 'calendar') {
      return;
    }

    const trimmed = noteDraft.trim();
    if (!trimmed) {
      toast.error('Please type a note first.');
      return;
    }

    setSavingNote(true);

    try {
      const token = requireToken();
      await addAdminCalendarEventNote(token, selectedEvent.sourceId, trimmed);
      setNoteDraft('');
      toast.success('Note added to activity log.');
      await refreshAll(visibleRange);
    } catch (error) {
      toast.error(normalizeErrorMessage(error, 'Unable to add note.'));
    } finally {
      setSavingNote(false);
    }
  }, [noteDraft, refreshAll, requireToken, selectedEvent, visibleRange]);

  const handleManualRefresh = useCallback(() => {
    void refreshAll(visibleRange).catch((error) => {
      toast.error(normalizeErrorMessage(error, 'Unable to refresh calendar data.'));
    });
  }, [refreshAll, visibleRange]);

  const renderEventContent = useCallback((arg: EventContentArg) => {
    const entry = arg.event.extendedProps as CalendarEventVm;
    const meta = EVENT_TYPE_META[entry.eventType];
    const Icon = meta.icon;

    return (
      <div className="calendar-event-content">
        <Icon className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="calendar-event-title">{arg.event.title}</span>
        {entry.technicianName && currentView !== 'dayGridMonth' ? (
          <span className="calendar-event-tech">{entry.technicianName}</span>
        ) : null}
      </div>
    );
  }, [currentView]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Calendar & Scheduling</h1>
          <p className="text-sm text-slate-600">
            Plan appointments, dispatch technician work, track deliveries, and manage reminders in one place.
          </p>
        </div>

        <Button
          onClick={() => openCreateModal()}
          className="h-9 gap-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          Create Appointment
        </Button>
      </div>

      <Card className="border-slate-200 p-4 shadow-sm">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => handleNavigate('prev')}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => handleNavigate('next')}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" className="h-9" onClick={() => handleNavigate('today')}>Today</Button>
            <h2 className="ml-2 text-lg font-semibold text-slate-900">{currentTitle || 'Schedule'}</h2>

            <div className="ml-auto flex items-center gap-2">
              {VIEW_OPTIONS.map((viewOption) => (
                <Button
                  key={viewOption.value}
                  size="sm"
                  variant={currentView === viewOption.value ? 'default' : 'outline'}
                  className={cn(
                    'h-8 rounded-full px-4 text-xs',
                    currentView === viewOption.value && 'bg-slate-900 text-white hover:bg-slate-800',
                  )}
                  onClick={() => handleViewChange(viewOption.value)}
                >
                  {viewOption.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1fr_220px_220px_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search events, customers, technicians..."
                className="h-10 pl-9"
              />
            </div>

            <Select value={selectedTechnicianFilter} onValueChange={setSelectedTechnicianFilter}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Filter technician" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Technicians</SelectItem>
                {technicianRows.map((tech) => (
                  <SelectItem key={tech.id} value={tech.id}>{tech.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={selectedTypeFilter}
              onValueChange={(value) => setSelectedTypeFilter(value as CalendarTypeFilter)}
            >
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Filter event type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Event Types</SelectItem>
                {EVENT_TYPE_OPTIONS.map((entryType) => (
                  <SelectItem key={entryType} value={entryType}>{EVENT_TYPE_META[entryType].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button variant="outline" className="h-10 gap-2" onClick={handleManualRefresh} disabled={refreshing}>
              <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card className="border-slate-200 p-3 shadow-sm sm:p-4">
          <div className={cn('calendar-shell transition-opacity', loading && 'opacity-65')}>
            <FullCalendar
              ref={calendarRef}
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              headerToolbar={false}
              selectable
              selectMirror
              editable
              dayMaxEvents={4}
              slotMinTime="06:00:00"
              slotMaxTime="22:00:00"
              nowIndicator
              height="auto"
              events={fullCalendarEvents}
              datesSet={handleDatesSet}
              select={handleDateSelect}
              eventClick={handleEventClick}
              eventDrop={handleEventDrop}
              eventResize={handleEventResize}
              eventContent={renderEventContent}
            />
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="border-slate-200 bg-white/95 p-4 shadow-sm dark:border-slate-600 dark:bg-slate-900/92">
            <div className="mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4 text-indigo-600" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Today's Schedule</h3>
            </div>
            <div className="space-y-2">
              {todaySchedule.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-200">No events scheduled for today.</p>
              ) : todaySchedule.map((entry) => (
                <div key={`${entry.id}-today`} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-600 dark:bg-slate-800/70">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-300">{formatClock(entry.start)}</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{entry.title}</p>
                  {entry.technicianName ? (
                    <p className="text-xs text-slate-600 dark:text-slate-200">{entry.technicianName}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </Card>

          <Card className="border-slate-200 bg-white/95 p-4 shadow-sm dark:border-slate-600 dark:bg-slate-900/92">
            <div className="mb-3 flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-indigo-600" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Upcoming Appointments</h3>
            </div>
            <div className="space-y-2">
              {upcomingAppointments.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-200">No upcoming appointments.</p>
              ) : upcomingAppointments.map((entry) => (
                <div key={`${entry.id}-upcoming`} className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-600 dark:bg-slate-800/60">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{entry.title}</p>
                  <p className="text-xs text-slate-600 dark:text-slate-200">{formatDateTime(entry.start)}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="border-slate-200 bg-white/95 p-4 shadow-sm dark:border-slate-600 dark:bg-slate-900/92">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-indigo-600" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Technician Availability</h3>
              </div>
              <div className="flex gap-1.5">
                <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">{availabilityCounts.available} Live</Badge>
                <Badge className="border-amber-200 bg-amber-50 text-amber-700">{availabilityCounts.busy} Busy</Badge>
                <Badge className="border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-500 dark:bg-slate-700 dark:text-slate-100">{availabilityCounts.offDuty} Off</Badge>
              </div>
            </div>

            <div className="space-y-2">
              {technicianAvailability.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-200">No technicians found.</p>
              ) : technicianAvailability.slice(0, 8).map((entry) => (
                <div key={entry.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-600 dark:bg-slate-800/60">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{entry.name}</p>
                  <Badge
                    className={cn(
                      entry.status === 'available' && 'border-emerald-200 bg-emerald-50 text-emerald-700',
                      entry.status === 'busy' && 'border-amber-200 bg-amber-50 text-amber-700',
                      entry.status === 'off_duty' && 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-500 dark:bg-slate-700 dark:text-slate-100',
                    )}
                  >
                    {entry.status === 'off_duty' ? 'Off-duty' : entry.status}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>

          <Card className="border-slate-200 bg-white/95 p-4 shadow-sm dark:border-slate-600 dark:bg-slate-900/92">
            <div className="mb-3 flex items-center gap-2">
              <Truck className="h-4 w-4 text-indigo-600" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Pending Deliveries</h3>
            </div>
            <div className="space-y-2">
              {pendingDeliveries.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-200">No pending deliveries.</p>
              ) : pendingDeliveries.map((entry) => (
                <div key={`${entry.id}-delivery`} className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-600 dark:bg-slate-800/60">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{entry.title}</p>
                  <p className="text-xs text-slate-600 dark:text-slate-200">{formatDateTime(entry.start)}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="border-slate-200 bg-white/95 p-4 shadow-sm dark:border-slate-600 dark:bg-slate-900/92">
            <div className="mb-3 flex items-center gap-2">
              <Activity className="h-4 w-4 text-indigo-600" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Selected Event</h3>
            </div>

            {!selectedEvent ? (
              <p className="text-sm text-slate-500 dark:text-slate-200">Select a calendar event to inspect details and actions.</p>
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="text-base font-semibold text-slate-900 dark:text-slate-100">{selectedEvent.title}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <Badge className={EVENT_TYPE_META[selectedEvent.eventType].chipClassName}>
                      {EVENT_TYPE_META[selectedEvent.eventType].label}
                    </Badge>
                    <Badge variant="outline" className="border-slate-200 text-slate-600 dark:border-slate-500 dark:text-slate-200">
                      {selectedEvent.source === 'calendar' ? 'Custom Event' : selectedEvent.source === 'job' ? 'Job Linked' : 'Invoice Linked'}
                    </Badge>
                  </div>
                </div>

                <div className="space-y-1 text-xs text-slate-600 dark:text-slate-200">
                  <p>{formatDateTime(selectedEvent.start)} - {formatDateTime(selectedEvent.end)}</p>
                  {selectedEvent.customerName ? <p>Customer: {selectedEvent.customerName}</p> : null}
                  {selectedEvent.location ? <p>Location: {selectedEvent.location}</p> : null}
                  {selectedEvent.statusLabel ? <p>Status: {selectedEvent.statusLabel}</p> : null}
                  {selectedEvent.description ? <p>{selectedEvent.description}</p> : null}
                </div>

                {selectedEvent.source === 'calendar' ? (
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEditModal(selectedEvent)}>
                      Edit Event
                    </Button>
                  </div>
                ) : null}

                {selectedEvent.source !== 'invoice' ? (
                  <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-600 dark:bg-slate-800/70">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">Move Between Technicians</p>
                    <Select value={selectedTechnicianId || 'unassigned'} onValueChange={(value) => setSelectedTechnicianId(value === 'unassigned' ? '' : value)}>
                      <SelectTrigger className="h-9 bg-white dark:border-slate-500 dark:bg-slate-900 dark:text-slate-100">
                        <SelectValue placeholder="Select technician" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {technicianRows.map((tech) => (
                          <SelectItem key={tech.id} value={tech.id}>{tech.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="sm" onClick={() => void handleApplyTechnicianReassign()} disabled={updatingTechnician}>
                      Save Assignment
                    </Button>
                  </div>
                ) : null}

                {selectedEvent.source === 'calendar' ? (
                  <>
                    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-600 dark:bg-slate-800/70">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">Reminder Channels</p>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline" className={selectedEvent.reminderEmail ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500 dark:border-slate-500 dark:text-slate-200'}>
                          <Mail className="mr-1 h-3 w-3" /> Email
                        </Badge>
                        <Badge variant="outline" className={selectedEvent.reminderSms ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500 dark:border-slate-500 dark:text-slate-200'}>
                          <MessageSquare className="mr-1 h-3 w-3" /> SMS
                        </Badge>
                        <Badge variant="outline" className={selectedEvent.reminderDashboard ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500 dark:border-slate-500 dark:text-slate-200'}>
                          <Bell className="mr-1 h-3 w-3" /> Dashboard
                        </Badge>
                      </div>
                    </div>

                    <div className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-600 dark:bg-slate-800/50">
                      <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">Add Internal Note</Label>
                      <Textarea
                        value={noteDraft}
                        onChange={(event) => setNoteDraft(event.target.value)}
                        rows={3}
                        placeholder="Add technician comments or internal update notes..."
                      />
                      <Button size="sm" className="gap-2" onClick={() => void handleAddNote()} disabled={savingNote}>
                        <Plus className="h-3.5 w-3.5" />
                        Add Note
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">Activity Log</p>
                      {selectedEvent.activityLog.length === 0 ? (
                        <p className="text-sm text-slate-500 dark:text-slate-200">No updates yet.</p>
                      ) : (
                        <div className="max-h-48 space-y-2 overflow-auto pr-1">
                          {selectedEvent.activityLog.slice().reverse().map((entry, index) => (
                            <div key={`${entry.timestamp}-${index}`} className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-600 dark:bg-slate-800/60">
                              <p className="text-xs font-medium text-slate-700 dark:text-slate-100">{entry.actor_role}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-300">{formatDateTime(new Date(entry.timestamp))}</p>
                              <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{entry.message}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                ) : null}
              </div>
            )}
          </Card>

          <Card className="border-slate-200 bg-white/95 p-4 shadow-sm dark:border-slate-600 dark:bg-slate-900/92">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <Database className="h-4 w-4 text-indigo-600" />
              Dispatch Integrations
            </div>
            <div className="mt-3 space-y-2 text-xs text-slate-600 dark:text-slate-200">
              <p>Jobs module sync: {jobRows.length} events linked</p>
              <p>Technicians module sync: {technicianRows.length} profiles loaded</p>
              <p>Invoices module sync: {invoiceRows.length} records checked</p>
              <p>Calendar custom events: {calendarRows.length} in current range</p>
            </div>
          </Card>
        </div>
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{modalMode === 'create' ? 'Create Appointment' : 'Edit Event'}</DialogTitle>
            <DialogDescription>
              Schedule appointments, deliveries, technician slots, reminders, and urgent tasks with unified dispatch controls.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="event-title">Event Title</Label>
              <Input
                id="event-title"
                value={formState.title}
                onChange={(event) => setFormState((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="Job intake visit, delivery drop, technician handoff..."
              />
            </div>

            <div className="space-y-2">
              <Label>Event Type</Label>
              <Select
                value={formState.eventType}
                onValueChange={(value) => setFormState((prev) => ({ ...prev, eventType: value as BackendCalendarEventType }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select event type" />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_TYPE_OPTIONS.map((entryType) => (
                    <SelectItem key={entryType} value={entryType}>{EVENT_TYPE_META[entryType].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Priority</Label>
              <Select
                value={formState.priority}
                onValueChange={(value) => setFormState((prev) => ({ ...prev, priority: value as BackendCalendarEventPriority }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((entry) => (
                    <SelectItem key={entry.value} value={entry.value}>{entry.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Customer Name</Label>
              <Input
                value={formState.customerName}
                onChange={(event) => setFormState((prev) => ({ ...prev, customerName: event.target.value }))}
                placeholder="Customer or dealership"
              />
            </div>

            <div className="space-y-2">
              <Label>Address / Location</Label>
              <Input
                value={formState.location}
                onChange={(event) => setFormState((prev) => ({ ...prev, location: event.target.value }))}
                placeholder="Street, city, service bay"
              />
            </div>

            <div className="space-y-2">
              <Label>Assigned Technician</Label>
              <Select
                value={formState.technicianId || 'unassigned'}
                onValueChange={(value) => setFormState((prev) => ({ ...prev, technicianId: value === 'unassigned' ? '' : value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Assign technician" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {technicianRows.map((tech) => (
                    <SelectItem key={tech.id} value={tech.id}>{tech.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Start Date & Time</Label>
              <Input
                type="datetime-local"
                value={formState.startAt}
                onChange={(event) => setFormState((prev) => ({ ...prev, startAt: event.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>End Date & Time</Label>
              <Input
                type="datetime-local"
                value={formState.endAt}
                onChange={(event) => setFormState((prev) => ({ ...prev, endAt: event.target.value }))}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Description / Notes</Label>
              <Textarea
                value={formState.description}
                onChange={(event) => setFormState((prev) => ({ ...prev, description: event.target.value }))}
                rows={3}
                placeholder="Operational context, prep notes, special handling instructions"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Attachments (optional)</Label>
              <Textarea
                value={formState.attachments}
                onChange={(event) => setFormState((prev) => ({ ...prev, attachments: event.target.value }))}
                rows={2}
                placeholder="Add one URL/path per line"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Internal Notes</Label>
              <Textarea
                value={formState.internalNotes}
                onChange={(event) => setFormState((prev) => ({ ...prev, internalNotes: event.target.value }))}
                rows={2}
                placeholder="Manager-only notes"
              />
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 md:col-span-2">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Reminder Notifications</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <span className="text-sm text-slate-700">Email</span>
                  <Switch
                    checked={formState.reminderEmail}
                    onCheckedChange={(checked) => setFormState((prev) => ({ ...prev, reminderEmail: checked }))}
                  />
                </label>
                <label className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <span className="text-sm text-slate-700">SMS</span>
                  <Switch
                    checked={formState.reminderSms}
                    onCheckedChange={(checked) => setFormState((prev) => ({ ...prev, reminderSms: checked }))}
                  />
                </label>
                <label className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <span className="text-sm text-slate-700">Dashboard</span>
                  <Switch
                    checked={formState.reminderDashboard}
                    onCheckedChange={(checked) => setFormState((prev) => ({ ...prev, reminderDashboard: checked }))}
                  />
                </label>
              </div>
            </div>
          </div>

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            {modalMode === 'edit' ? (
              <Button
                type="button"
                variant="outline"
                className="border-rose-200 text-rose-700 hover:bg-rose-50"
                onClick={() => void handleDeleteCalendarEvent()}
                disabled={savingForm}
              >
                Delete Event
              </Button>
            ) : <span />}
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)} disabled={savingForm}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void handleSaveCalendarEvent()} disabled={savingForm}>
                {savingForm ? 'Saving...' : modalMode === 'create' ? 'Create Appointment' : 'Save Changes'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

