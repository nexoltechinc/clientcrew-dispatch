import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  Clock3,
  FileText,
  Headphones,
  MessageCircleMore,
  Send,
  Sparkles,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  lookupCustomerInvoice,
  lookupCustomerJob,
  submitCustomerServiceRequest,
  type CustomerInvoiceLookupResponse,
  type CustomerJobLookupResponse,
  type CustomerServiceRequestResponse,
} from '@/lib/customer-api';
import { CUSTOMER_SERVICE_FAMILIES, normalizeCustomerServiceSelection } from '@/lib/customer-service-matcher';
import { clearCustomerPortalDraft, saveCustomerPortalDraft } from '@/lib/customer-session';
import { useCustomerPortal } from '@/components/customer/customer-portal-context';
import { cn } from '@/lib/utils';

type ChatFlow = 'idle' | 'request' | 'status' | 'invoice' | 'handoff';

type ChatMessage = {
  id: string;
  role: 'bot' | 'user';
  text: string;
  meta?: string;
};

type RequestDraft = {
  serviceText: string;
  selectedServices: string[];
  customerName: string;
  contactPerson: string;
  phone: string;
  email: string;
  vehicleDescription: string;
  vehicleUnitOrStockNumber: string;
  preferredDate: string;
  preferredTime: string;
  serviceLocationOrBranch: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  specialNotes: string;
};

type LookupDraft = {
  jobCode: string;
  customerName: string;
  contactEmail: string;
  contactPhone: string;
};

type InvoiceDraft = {
  invoiceNumber: string;
  jobCode: string;
  customerName: string;
  contactEmail: string;
  contactPhone: string;
};

type HandoffDraft = {
  customerName: string;
  contactPerson: string;
  phone: string;
  email: string;
  issueSummary: string;
  invoiceNumber: string;
  jobCode: string;
  serviceLocationOrBranch: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  specialNotes: string;
};

const WELCOME_MESSAGE =
  'Welcome to DispatchIQ support. I can help you view services, request a service, check job status, ask about invoices, or connect you with our dispatch team.';

const QUICK_ACTIONS = [
  { label: 'View Services', flow: 'services' as const },
  { label: 'Request Service', flow: 'request' as const },
  { label: 'Check Job Status', flow: 'status' as const },
  { label: 'Invoice Question', flow: 'invoice' as const },
  { label: 'Talk to Agent', flow: 'handoff' as const },
];

const STATUS_HINTS = [
  'Received and under review',
  'Ready to assign',
  'Waiting for confirmation',
  'Pending assignment',
  'Scheduled',
  'In progress',
  'Delayed',
  'Completed',
  'Cancelled',
];

const INVOICE_HINTS = [
  { label: 'Draft', description: 'invoice is being prepared' },
  { label: 'Sent', description: 'invoice has been issued' },
  { label: 'Paid', description: 'payment was recorded' },
  { label: 'Overdue', description: 'due date has passed' },
  { label: 'Cancelled', description: 'invoice is no longer active' },
];

function makeId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function todayValue() {
  return new Date().toISOString().slice(0, 10);
}

function timeValue() {
  return new Date().toTimeString().slice(0, 5);
}

function toDateTimeNow() {
  return new Date();
}

function formatCurrency(value: string | number) {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(numeric)) {
    return '$0.00';
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(numeric);
}

function isKeywordMatch(text: string, keywords: string[]) {
  const normalized = text.trim().toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword));
}

function buildRequestDefaults(): RequestDraft {
  return {
    serviceText: '',
    selectedServices: [],
    customerName: '',
    contactPerson: '',
    phone: '',
    email: '',
    vehicleDescription: '',
    vehicleUnitOrStockNumber: '',
    preferredDate: todayValue(),
    preferredTime: timeValue(),
    serviceLocationOrBranch: '',
    urgency: 'medium',
    specialNotes: '',
  };
}

function buildStatusDefaults(): LookupDraft {
  return {
    jobCode: '',
    customerName: '',
    contactEmail: '',
    contactPhone: '',
  };
}

function buildInvoiceDefaults(): InvoiceDraft {
  return {
    invoiceNumber: '',
    jobCode: '',
    customerName: '',
    contactEmail: '',
    contactPhone: '',
  };
}

function buildHandoffDefaults(): HandoffDraft {
  return {
    customerName: '',
    contactPerson: '',
    phone: '',
    email: '',
    issueSummary: '',
    invoiceNumber: '',
    jobCode: '',
    serviceLocationOrBranch: '',
    urgency: 'high',
    specialNotes: '',
  };
}

export function CustomerChatWidget() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { branding, sessionId, setLastReferenceNumber } = useCustomerPortal();

  const [open, setOpen] = useState(false);
  const [flow, setFlow] = useState<ChatFlow>('idle');
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: makeId('msg'),
      role: 'bot',
      text: WELCOME_MESSAGE,
      meta: 'Welcome',
    },
  ]);
  const [composer, setComposer] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [requestDraft, setRequestDraft] = useState<RequestDraft>(() => buildRequestDefaults());
  const [statusDraft, setStatusDraft] = useState<LookupDraft>(() => buildStatusDefaults());
  const [invoiceDraft, setInvoiceDraft] = useState<InvoiceDraft>(() => buildInvoiceDefaults());
  const [handoffDraft, setHandoffDraft] = useState<HandoffDraft>(() => buildHandoffDefaults());
  const [requestResult, setRequestResult] = useState<CustomerServiceRequestResponse | null>(null);
  const [statusResult, setStatusResult] = useState<CustomerJobLookupResponse | null>(null);
  const [invoiceResult, setInvoiceResult] = useState<CustomerInvoiceLookupResponse | null>(null);
  const [handoffResult, setHandoffResult] = useState<CustomerServiceRequestResponse | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const hasOpenResult = Boolean(requestResult || statusResult || invoiceResult || handoffResult);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, requestResult, statusResult, invoiceResult, handoffResult, flow, isSubmitting]);

  useEffect(() => {
    if (!open) {
      setErrorMessage(null);
    }
  }, [open]);

  useEffect(() => {
    if (flow === 'request') {
      saveCustomerPortalDraft({ intent: 'request', requestDraft, sessionId });
    }
  }, [flow, requestDraft, sessionId]);

  useEffect(() => {
    if (flow === 'status') {
      saveCustomerPortalDraft({ intent: 'status', statusDraft, sessionId });
    }
  }, [flow, statusDraft, sessionId]);

  useEffect(() => {
    if (flow === 'invoice') {
      saveCustomerPortalDraft({ intent: 'invoice', invoiceDraft, sessionId });
    }
  }, [flow, invoiceDraft, sessionId]);

  useEffect(() => {
    if (flow === 'handoff') {
      saveCustomerPortalDraft({ intent: 'handoff', handoffDraft, sessionId });
    }
  }, [flow, handoffDraft, sessionId]);

  const addMessage = (role: ChatMessage['role'], text: string, meta?: string) => {
    setMessages((current) => [
      ...current,
      { id: makeId('msg'), role, text, meta },
    ]);
  };

  const resetResults = () => {
    setRequestResult(null);
    setStatusResult(null);
    setInvoiceResult(null);
    setHandoffResult(null);
    setErrorMessage(null);
  };

  const openFlow = (nextFlow: ChatFlow) => {
    resetResults();
    setFlow(nextFlow);
    setComposer('');
    switch (nextFlow) {
      case 'request':
        addMessage('bot', 'Let us capture the request details. You can also browse the public catalog first if that helps.', 'Request');
        setRequestDraft((current) => ({
          ...buildRequestDefaults(),
          ...current,
        }));
        break;
      case 'status':
        addMessage('bot', 'Please enter your job code first. If you do not have it, I will ask for account details next.', 'Status');
        setStatusDraft((current) => ({
          ...buildStatusDefaults(),
          ...current,
        }));
        break;
      case 'invoice':
        addMessage('bot', 'I can look up the invoice status and then route anything disputed to dispatch/admin.', 'Invoice');
        setInvoiceDraft((current) => ({
          ...buildInvoiceDefaults(),
          ...current,
        }));
        break;
      case 'handoff':
        addMessage('bot', 'I will connect you with our dispatch team. Please share the basics and I will save the request.', 'Handoff');
        setHandoffDraft((current) => ({
          ...buildHandoffDefaults(),
          ...current,
        }));
        break;
      default:
        break;
    }
  };

  const handleSendComposer = () => {
    const value = composer.trim();
    if (!value) {
      return;
    }

    addMessage('user', value);
    setComposer('');

    const lowered = value.toLowerCase();
    if (isKeywordMatch(lowered, ['request', 'service', 'book', 'appointment'])) {
      addMessage('bot', 'I can help with that. I opened the request flow and added a few service shortcuts below.', 'Request');
      openFlow('request');
      return;
    }
    if (isKeywordMatch(lowered, ['status', 'track', 'job code'])) {
      addMessage('bot', 'I opened job status lookup. Please share the job code first.', 'Status');
      openFlow('status');
      return;
    }
    if (isKeywordMatch(lowered, ['invoice', 'billing', 'payment'])) {
      addMessage('bot', 'I opened invoice help. Share the invoice number or job code and I will look it up.', 'Invoice');
      openFlow('invoice');
      return;
    }
    if (isKeywordMatch(lowered, ['agent', 'human', 'dispatcher', 'admin'])) {
      addMessage('bot', 'I opened the agent handoff form so dispatch can review your request.', 'Handoff');
      openFlow('handoff');
      return;
    }

    const suggestions = normalizeCustomerServiceSelection(value).matchedFamilies.map((family) => family.label);
    if (suggestions.length > 0) {
      addMessage(
        'bot',
        `I found possible matches: ${suggestions.join(', ')}. If you want, open Request Service and I will help you narrow it down.`,
        'Suggestion',
      );
      return;
    }

    addMessage(
      'bot',
      'I can help with service requests, job status, invoices, or agent handoff. Use one of the quick actions above to continue.',
      'Help',
    );
  };

  const handleQuickAction = (flowAction: string) => {
    if (flowAction === 'services') {
      setOpen(false);
      navigate('/customer/services');
      return;
    }
    if (flowAction === 'request') {
      openFlow('request');
      return;
    }
    if (flowAction === 'status') {
      openFlow('status');
      return;
    }
    if (flowAction === 'invoice') {
      openFlow('invoice');
      return;
    }
    if (flowAction === 'handoff') {
      openFlow('handoff');
    }
  };

  const selectedRequestFamilies = useMemo(
    () => normalizeCustomerServiceSelection(requestDraft.serviceText, []).matchedFamilies,
    [requestDraft.serviceText],
  );

  const submitRequest = async (mode: 'request' | 'handoff') => {
    if (mode === 'request') {
      if (!requestDraft.customerName.trim()) {
        setErrorMessage('Enter the dealership or customer name.');
        return;
      }
      if (!requestDraft.contactPerson.trim()) {
        setErrorMessage('Enter the contact person.');
        return;
      }
      if (!requestDraft.phone.trim() && !requestDraft.email.trim()) {
        setErrorMessage('Enter a phone number or email address.');
        return;
      }
      if (!requestDraft.vehicleDescription.trim()) {
        setErrorMessage('Enter the vehicle description.');
        return;
      }
      if (!requestDraft.serviceText.trim() && requestDraft.selectedServices.length === 0) {
        setErrorMessage('Add a service description or choose a service family.');
        return;
      }
    } else {
      if (!handoffDraft.customerName.trim()) {
        setErrorMessage('Enter the dealership or customer name.');
        return;
      }
      if (!handoffDraft.contactPerson.trim()) {
        setErrorMessage('Enter the contact person.');
        return;
      }
      if (!handoffDraft.phone.trim() && !handoffDraft.email.trim()) {
        setErrorMessage('Enter a phone number or email address.');
        return;
      }
      if (!handoffDraft.issueSummary.trim()) {
        setErrorMessage('Enter a short issue summary so dispatch can review it.');
        return;
      }
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      if (mode === 'request') {
        const normalized = normalizeCustomerServiceSelection(requestDraft.serviceText);
        const payload = {
          customer_name: requestDraft.customerName.trim(),
          contact_person: requestDraft.contactPerson.trim(),
          phone: requestDraft.phone.trim() || null,
          email: requestDraft.email.trim() || null,
          vehicle_description: requestDraft.vehicleDescription.trim(),
          vehicle_unit_or_stock_number: requestDraft.vehicleUnitOrStockNumber.trim() || null,
          requested_services: requestDraft.selectedServices.length > 0 ? requestDraft.selectedServices : normalized.matchedFamilies.map((family) => family.label),
          requested_service_text: requestDraft.serviceText.trim() || null,
          preferred_date: requestDraft.preferredDate,
          preferred_time: requestDraft.preferredTime,
          service_location_or_branch: requestDraft.serviceLocationOrBranch.trim() || null,
          urgency: requestDraft.urgency,
          special_notes: requestDraft.specialNotes.trim() || null,
          portal_session_id: sessionId,
          idempotency_key: `${sessionId}-${requestDraft.customerName.trim().toLowerCase().replace(/\s+/g, '-')}-${requestDraft.preferredDate}`,
          source_channel: 'website_chatbot',
        } as const;

        const response = await submitCustomerServiceRequest(payload);
        setRequestResult(response);
        setLastReferenceNumber(response.reference_number);
        clearCustomerPortalDraft();
        addMessage('user', requestDraft.serviceText.trim() || requestDraft.selectedServices.join(', '));
        addMessage(
          'bot',
          response.agent_available
            ? `Your request was submitted successfully. Reference ${response.reference_number}. A dispatcher can review it now.`
            : `Your request was submitted successfully. Reference ${response.reference_number}. Dispatch/admin will review it shortly.`,
          'Confirmation',
        );
      } else {
        const now = toDateTimeNow();
        const response = await submitCustomerServiceRequest({
          customer_name: handoffDraft.customerName.trim(),
          contact_person: handoffDraft.contactPerson.trim(),
          phone: handoffDraft.phone.trim() || null,
          email: handoffDraft.email.trim() || null,
          vehicle_description: 'Support request',
          vehicle_unit_or_stock_number: handoffDraft.jobCode.trim() || null,
          requested_services: [],
          requested_service_text: handoffDraft.issueSummary.trim(),
          preferred_date: now.toISOString().slice(0, 10),
          preferred_time: now.toTimeString().slice(0, 5),
          service_location_or_branch: handoffDraft.serviceLocationOrBranch.trim() || null,
          urgency: handoffDraft.urgency,
          special_notes: [
            handoffDraft.specialNotes.trim(),
            handoffDraft.invoiceNumber.trim() ? `Invoice number: ${handoffDraft.invoiceNumber.trim()}` : '',
            handoffDraft.jobCode.trim() ? `Job code: ${handoffDraft.jobCode.trim()}` : '',
          ].filter(Boolean).join(' | '),
          portal_session_id: sessionId,
          idempotency_key: `${sessionId}-${handoffDraft.customerName.trim().toLowerCase().replace(/\s+/g, '-')}-handoff`,
          source_channel: 'website_chatbot',
        });

        setHandoffResult(response);
        setLastReferenceNumber(response.reference_number);
        clearCustomerPortalDraft();
        addMessage('user', handoffDraft.issueSummary.trim());
        addMessage(
          'bot',
          'I’ll connect you with our dispatch team. Please wait while an agent reviews your request.',
          'Handoff',
        );
        if (!response.agent_available) {
          addMessage(
            'bot',
            'Our team is not available right now, but your request has been saved and dispatch will follow up.',
            'Fallback',
          );
        }
      }
      setFlow('idle');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Request failed.';
      setErrorMessage(message);
      addMessage('bot', message, 'Error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitStatusLookup = async () => {
    if (!statusDraft.jobCode.trim() && !statusDraft.customerName.trim()) {
      setErrorMessage('Enter a job code or account details.');
      return;
    }
    if (!statusDraft.jobCode.trim() && !statusDraft.contactEmail.trim() && !statusDraft.contactPhone.trim()) {
      setErrorMessage('Add an email or phone number so I can refine the lookup.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await lookupCustomerJob({
        job_code: statusDraft.jobCode.trim() || null,
        customer_name: statusDraft.customerName.trim() || null,
        contact_email: statusDraft.contactEmail.trim() || null,
        contact_phone: statusDraft.contactPhone.trim() || null,
      });
      setStatusResult(response);
      addMessage('user', statusDraft.jobCode.trim() || statusDraft.customerName.trim());
      addMessage('bot', response.message, 'Status');
      if (response.matches.length > 0) {
        setLastReferenceNumber(response.matches[0].reference_number);
      }
      setFlow('idle');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Lookup failed.';
      setErrorMessage(message);
      addMessage('bot', message, 'Error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitInvoiceLookup = async () => {
    if (!invoiceDraft.invoiceNumber.trim() && !invoiceDraft.jobCode.trim()) {
      setErrorMessage('Enter an invoice number or job code.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await lookupCustomerInvoice({
        invoice_number: invoiceDraft.invoiceNumber.trim() || null,
        job_code: invoiceDraft.jobCode.trim() || null,
        customer_name: invoiceDraft.customerName.trim() || null,
        contact_email: invoiceDraft.contactEmail.trim() || null,
        contact_phone: invoiceDraft.contactPhone.trim() || null,
      });
      setInvoiceResult(response);
      addMessage('user', invoiceDraft.invoiceNumber.trim() || invoiceDraft.jobCode.trim());
      addMessage('bot', response.message, 'Invoice');
      setFlow('idle');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invoice lookup failed.';
      setErrorMessage(message);
      addMessage('bot', message, 'Error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const serviceSuggestions = useMemo(
    () => CUSTOMER_SERVICE_FAMILIES.filter((family) => normalizeCustomerServiceSelection(requestDraft.serviceText).matchedFamilies.some((match) => match.key === family.key)),
    [requestDraft.serviceText],
  );

  const requestResultCard = requestResult ? (
    <ResultCard
      title="Service request submitted"
      referenceNumber={requestResult.reference_number}
      status={requestResult.status_label}
      summary={requestResult.summary}
      nextStep={requestResult.next_step}
    />
  ) : null;

  const statusResultCard = statusResult ? <StatusResultCard response={statusResult} /> : null;
  const invoiceResultCard = invoiceResult ? <InvoiceResultCard response={invoiceResult} /> : null;
  const handoffResultCard = handoffResult ? (
    <ResultCard
      title="Request saved for dispatch"
      referenceNumber={handoffResult.reference_number}
      status={handoffResult.status_label}
      summary={handoffResult.summary}
      nextStep={handoffResult.next_step}
    />
  ) : null;

  return (
    <Sheet
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value && messages.length === 1) {
          setMessages([
            {
              id: makeId('msg'),
              role: 'bot',
              text: WELCOME_MESSAGE,
              meta: 'Welcome',
            },
          ]);
        }
      }}
    >
      <SheetTrigger asChild>
        <Button
          className="fixed bottom-5 right-5 z-40 h-14 rounded-full px-5 shadow-[0_18px_40px_rgba(15,23,42,0.2)]"
          style={{ backgroundColor: branding.primary_color }}
        >
          <MessageCircleMore className="h-5 w-5" />
          <span className="hidden sm:inline">Chat with DispatchIQ</span>
          <span className="sm:hidden">Chat</span>
        </Button>
      </SheetTrigger>

      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className={cn(
          'flex h-[90vh] w-full flex-col gap-0 p-0 sm:max-w-[480px]',
          isMobile && 'h-[88vh] rounded-t-[28px]',
        )}
      >
        <SheetHeader className="border-b border-slate-100 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <SheetTitle className="flex items-center gap-2 text-slate-900">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-2xl text-white"
                  style={{ backgroundColor: branding.primary_color }}
                >
                  <Sparkles className="h-4 w-4" />
                </div>
                <span>{branding.name || 'DispatchIQ'}</span>
              </SheetTitle>
              <SheetDescription className="mt-1 text-sm text-slate-600">
                Support and service intake with customer-safe routing.
              </SheetDescription>
            </div>
            <Badge variant="outline" className="rounded-full border-emerald-200 bg-emerald-50 text-emerald-700">
              Online
            </Badge>
          </div>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col">
          <ScrollArea className="min-h-0 flex-1 px-4 py-4">
            <div className="space-y-4">
              {messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  role={message.role}
                  text={message.text}
                  meta={message.meta}
                  accentColor={branding.primary_color}
                />
              ))}

              {flow === 'request' ? (
                <RequestForm
                  value={requestDraft}
                  onChange={setRequestDraft}
                  onSubmit={() => void submitRequest('request')}
                  onAgentFirst={() => void submitRequest('handoff')}
                  loading={isSubmitting}
                  serviceSuggestions={serviceSuggestions}
                  selectedFamilies={selectedRequestFamilies}
                  accentColor={branding.primary_color}
                />
              ) : null}

              {flow === 'status' ? (
                <StatusForm
                  value={statusDraft}
                  onChange={setStatusDraft}
                  onSubmit={() => void submitStatusLookup()}
                  loading={isSubmitting}
                  accentColor={branding.primary_color}
                />
              ) : null}

              {flow === 'invoice' ? (
                <InvoiceForm
                  value={invoiceDraft}
                  onChange={setInvoiceDraft}
                  onSubmit={() => void submitInvoiceLookup()}
                  loading={isSubmitting}
                  accentColor={branding.primary_color}
                />
              ) : null}

              {flow === 'handoff' ? (
                <HandoffForm
                  value={handoffDraft}
                  onChange={setHandoffDraft}
                  onSubmit={() => void submitRequest('handoff')}
                  loading={isSubmitting}
                  accentColor={branding.primary_color}
                />
              ) : null}

              {errorMessage ? <ErrorBanner message={errorMessage} /> : null}
              {requestResultCard}
              {statusResultCard}
              {invoiceResultCard}
              {handoffResultCard}
              {hasOpenResult ? <Separator className="my-3" /> : null}
              <div ref={endRef} />
            </div>
          </ScrollArea>

          <div className="border-t border-slate-100 bg-white px-4 py-4">
            <div className="grid gap-2 sm:grid-cols-5">
              {QUICK_ACTIONS.map((action) => (
                <Button
                  key={action.label}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickAction(action.flow)}
                  className="justify-start rounded-2xl border-slate-200 bg-white text-left text-xs font-semibold text-slate-700 shadow-sm"
                >
                  {action.label}
                </Button>
              ))}
            </div>

            <Separator className="my-4" />

            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <Label htmlFor="customer-chat-composer" className="sr-only">
                  Message DispatchIQ support
                </Label>
                <Textarea
                  id="customer-chat-composer"
                  value={composer}
                  onChange={(event) => setComposer(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      handleSendComposer();
                    }
                  }}
                  placeholder="Ask about services, status, invoices, or an agent..."
                  className="min-h-14 rounded-2xl border-slate-200 bg-slate-50 text-sm"
                />
              </div>
              <Button
                type="button"
                className="h-12 rounded-2xl px-4"
                style={{ backgroundColor: branding.primary_color }}
                onClick={handleSendComposer}
                disabled={!composer.trim()}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function MessageBubble({
  role,
  text,
  meta,
  accentColor,
}: {
  role: 'bot' | 'user';
  text: string;
  meta?: string;
  accentColor: string;
}) {
  return (
    <div className={cn('flex', role === 'user' ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[92%] rounded-3xl px-4 py-3 text-sm leading-6 shadow-sm',
          role === 'user'
            ? 'bg-slate-900 text-white'
            : 'border border-slate-100 bg-white text-slate-800',
        )}
      >
        {meta ? (
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.24em] opacity-60">
            {meta}
          </div>
        ) : null}
        <p>{text}</p>
      </div>
    </div>
  );
}

function RequestForm({
  value,
  onChange,
  onSubmit,
  onAgentFirst,
  loading,
  serviceSuggestions,
  selectedFamilies,
  accentColor,
}: {
  value: RequestDraft;
  onChange: (value: RequestDraft) => void;
  onSubmit: () => void;
  onAgentFirst: () => void;
  loading: boolean;
  serviceSuggestions: typeof CUSTOMER_SERVICE_FAMILIES;
  selectedFamilies: typeof CUSTOMER_SERVICE_FAMILIES;
  accentColor: string;
}) {
  const matches = normalizeCustomerServiceSelection(value.serviceText).matchedFamilies;

  const toggleFamily = (label: string) => {
    const exists = value.selectedServices.includes(label);
    onChange({
      ...value,
      selectedServices: exists
        ? value.selectedServices.filter((item) => item !== label)
        : [...value.selectedServices, label],
    });
  };

  return (
    <Card className="rounded-[24px] border-slate-200 bg-slate-50/80 shadow-sm">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="rounded-full border-slate-200 bg-white text-slate-600">
            Request form
          </Badge>
          {matches.length > 0 ? (
            <Badge variant="outline" className="rounded-full border-emerald-200 bg-emerald-50 text-emerald-700">
              {matches.length} suggestion{matches.length > 1 ? 's' : ''}
            </Badge>
          ) : null}
        </div>

        <div className="grid gap-3">
          <Field label="What service do you need?">
            <Textarea
              value={value.serviceText}
              onChange={(event) =>
                onChange({
                  ...value,
                  serviceText: event.target.value,
                })
              }
              placeholder="Describe the job in your own words"
              className="min-h-20 rounded-2xl border-slate-200 bg-white"
            />
          </Field>

          <div className="flex flex-wrap gap-2">
            {CUSTOMER_SERVICE_FAMILIES.map((family) => {
              const active = value.selectedServices.includes(family.label);
              return (
                <Button
                  key={family.key}
                  type="button"
                  variant={active ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => toggleFamily(family.label)}
                  className="rounded-full"
                  style={active ? { backgroundColor: accentColor } : undefined}
                >
                  {family.label}
                </Button>
              );
            })}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Customer or dealership name">
              <Input
                value={value.customerName}
                onChange={(event) => onChange({ ...value, customerName: event.target.value })}
                className="h-11 rounded-2xl border-slate-200 bg-white"
              />
            </Field>
            <Field label="Contact person">
              <Input
                value={value.contactPerson}
                onChange={(event) => onChange({ ...value, contactPerson: event.target.value })}
                className="h-11 rounded-2xl border-slate-200 bg-white"
              />
            </Field>
            <Field label="Phone">
              <Input
                value={value.phone}
                onChange={(event) => onChange({ ...value, phone: event.target.value })}
                className="h-11 rounded-2xl border-slate-200 bg-white"
              />
            </Field>
            <Field label="Email">
              <Input
                value={value.email}
                onChange={(event) => onChange({ ...value, email: event.target.value })}
                className="h-11 rounded-2xl border-slate-200 bg-white"
              />
            </Field>
            <Field label="Vehicle description">
              <Input
                value={value.vehicleDescription}
                onChange={(event) => onChange({ ...value, vehicleDescription: event.target.value })}
                className="h-11 rounded-2xl border-slate-200 bg-white"
              />
            </Field>
            <Field label="Stock or unit number, optional">
              <Input
                value={value.vehicleUnitOrStockNumber}
                onChange={(event) => onChange({ ...value, vehicleUnitOrStockNumber: event.target.value })}
                className="h-11 rounded-2xl border-slate-200 bg-white"
              />
            </Field>
            <Field label="Preferred date">
              <Input
                type="date"
                value={value.preferredDate}
                min={todayValue()}
                onChange={(event) => onChange({ ...value, preferredDate: event.target.value })}
                className="h-11 rounded-2xl border-slate-200 bg-white"
              />
            </Field>
            <Field label="Preferred time">
              <Input
                type="time"
                value={value.preferredTime}
                onChange={(event) => onChange({ ...value, preferredTime: event.target.value })}
                className="h-11 rounded-2xl border-slate-200 bg-white"
              />
            </Field>
            <Field label="Service location or branch">
              <Input
                value={value.serviceLocationOrBranch}
                onChange={(event) => onChange({ ...value, serviceLocationOrBranch: event.target.value })}
                className="h-11 rounded-2xl border-slate-200 bg-white"
              />
            </Field>
          </div>

          <Field label="Urgency level">
            <select
              value={value.urgency}
              onChange={(event) =>
                onChange({ ...value, urgency: event.target.value as RequestDraft['urgency'] })
              }
              className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-[color:var(--customer-primary)]"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </Field>

          <Field label="Special notes or access instructions">
            <Textarea
              value={value.specialNotes}
              onChange={(event) => onChange({ ...value, specialNotes: event.target.value })}
              placeholder="Gate codes, parking, technician access, or other details"
              className="min-h-20 rounded-2xl border-slate-200 bg-white"
            />
          </Field>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" onClick={onSubmit} disabled={loading} className="rounded-2xl" style={{ backgroundColor: accentColor }}>
            {loading ? <Spinner className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            Submit Request
          </Button>
          <Button type="button" variant="outline" onClick={onAgentFirst} disabled={loading} className="rounded-2xl">
            <Headphones className="h-4 w-4" />
            Talk to Agent First
          </Button>
        </div>

        {matches.length > 0 ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            I matched your text to {matches.map((family) => family.label).join(', ')}.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function StatusForm({
  value,
  onChange,
  onSubmit,
  loading,
  accentColor,
}: {
  value: LookupDraft;
  onChange: (value: LookupDraft) => void;
  onSubmit: () => void;
  loading: boolean;
  accentColor: string;
}) {
  return (
    <Card className="rounded-[24px] border-slate-200 bg-slate-50/80 shadow-sm">
      <CardContent className="space-y-4 p-4">
        <Badge variant="outline" className="rounded-full border-slate-200 bg-white text-slate-600">
          Job status lookup
        </Badge>
        <Field label="Job code">
          <Input
            value={value.jobCode}
            onChange={(event) => onChange({ ...value, jobCode: event.target.value })}
            placeholder="Ask the customer for the job code first"
            className="h-11 rounded-2xl border-slate-200 bg-white"
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Dealership or account name">
            <Input
              value={value.customerName}
              onChange={(event) => onChange({ ...value, customerName: event.target.value })}
              className="h-11 rounded-2xl border-slate-200 bg-white"
            />
          </Field>
          <Field label="Email">
            <Input
              value={value.contactEmail}
              onChange={(event) => onChange({ ...value, contactEmail: event.target.value })}
              className="h-11 rounded-2xl border-slate-200 bg-white"
            />
          </Field>
          <Field label="Phone">
            <Input
              value={value.contactPhone}
              onChange={(event) => onChange({ ...value, contactPhone: event.target.value })}
              className="h-11 rounded-2xl border-slate-200 bg-white"
            />
          </Field>
        </div>
        <Button type="button" onClick={onSubmit} disabled={loading} className="rounded-2xl" style={{ backgroundColor: accentColor }}>
          {loading ? <Spinner className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}
          Check Status
        </Button>
        <StatusHint />
      </CardContent>
    </Card>
  );
}

function InvoiceForm({
  value,
  onChange,
  onSubmit,
  loading,
  accentColor,
}: {
  value: InvoiceDraft;
  onChange: (value: InvoiceDraft) => void;
  onSubmit: () => void;
  loading: boolean;
  accentColor: string;
}) {
  return (
    <Card className="rounded-[24px] border-slate-200 bg-slate-50/80 shadow-sm">
      <CardContent className="space-y-4 p-4">
        <Badge variant="outline" className="rounded-full border-slate-200 bg-white text-slate-600">
          Invoice question
        </Badge>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Invoice number">
            <Input
              value={value.invoiceNumber}
              onChange={(event) => onChange({ ...value, invoiceNumber: event.target.value })}
              className="h-11 rounded-2xl border-slate-200 bg-white"
            />
          </Field>
          <Field label="Job code">
            <Input
              value={value.jobCode}
              onChange={(event) => onChange({ ...value, jobCode: event.target.value })}
              className="h-11 rounded-2xl border-slate-200 bg-white"
            />
          </Field>
          <Field label="Dealership or account name">
            <Input
              value={value.customerName}
              onChange={(event) => onChange({ ...value, customerName: event.target.value })}
              className="h-11 rounded-2xl border-slate-200 bg-white"
            />
          </Field>
          <Field label="Email">
            <Input
              value={value.contactEmail}
              onChange={(event) => onChange({ ...value, contactEmail: event.target.value })}
              className="h-11 rounded-2xl border-slate-200 bg-white"
            />
          </Field>
          <Field label="Phone">
            <Input
              value={value.contactPhone}
              onChange={(event) => onChange({ ...value, contactPhone: event.target.value })}
              className="h-11 rounded-2xl border-slate-200 bg-white"
            />
          </Field>
        </div>
        <Button type="button" onClick={onSubmit} disabled={loading} className="rounded-2xl" style={{ backgroundColor: accentColor }}>
          {loading ? <Spinner className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
          Look up Invoice
        </Button>
        <InvoiceHint />
      </CardContent>
    </Card>
  );
}

function HandoffForm({
  value,
  onChange,
  onSubmit,
  loading,
  accentColor,
}: {
  value: HandoffDraft;
  onChange: (value: HandoffDraft) => void;
  onSubmit: () => void;
  loading: boolean;
  accentColor: string;
}) {
  return (
    <Card className="rounded-[24px] border-slate-200 bg-slate-50/80 shadow-sm">
      <CardContent className="space-y-4 p-4">
        <Badge variant="outline" className="rounded-full border-slate-200 bg-white text-slate-600">
          Human handoff
        </Badge>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Dealership or account name">
            <Input
              value={value.customerName}
              onChange={(event) => onChange({ ...value, customerName: event.target.value })}
              className="h-11 rounded-2xl border-slate-200 bg-white"
            />
          </Field>
          <Field label="Contact person">
            <Input
              value={value.contactPerson}
              onChange={(event) => onChange({ ...value, contactPerson: event.target.value })}
              className="h-11 rounded-2xl border-slate-200 bg-white"
            />
          </Field>
          <Field label="Phone">
            <Input
              value={value.phone}
              onChange={(event) => onChange({ ...value, phone: event.target.value })}
              className="h-11 rounded-2xl border-slate-200 bg-white"
            />
          </Field>
          <Field label="Email">
            <Input
              value={value.email}
              onChange={(event) => onChange({ ...value, email: event.target.value })}
              className="h-11 rounded-2xl border-slate-200 bg-white"
            />
          </Field>
          <Field label="Job code, optional">
            <Input
              value={value.jobCode}
              onChange={(event) => onChange({ ...value, jobCode: event.target.value })}
              className="h-11 rounded-2xl border-slate-200 bg-white"
            />
          </Field>
          <Field label="Invoice number, optional">
            <Input
              value={value.invoiceNumber}
              onChange={(event) => onChange({ ...value, invoiceNumber: event.target.value })}
              className="h-11 rounded-2xl border-slate-200 bg-white"
            />
          </Field>
          <Field label="Preferred location or branch">
            <Input
              value={value.serviceLocationOrBranch}
              onChange={(event) => onChange({ ...value, serviceLocationOrBranch: event.target.value })}
              className="h-11 rounded-2xl border-slate-200 bg-white"
            />
          </Field>
          <Field label="Urgency">
            <select
              value={value.urgency}
              onChange={(event) =>
                onChange({ ...value, urgency: event.target.value as HandoffDraft['urgency'] })
              }
              className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-[color:var(--customer-primary)]"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </Field>
        </div>
        <Field label="Issue summary">
          <Textarea
            value={value.issueSummary}
            onChange={(event) => onChange({ ...value, issueSummary: event.target.value })}
            placeholder="Tell dispatch why you need help"
            className="min-h-20 rounded-2xl border-slate-200 bg-white"
          />
        </Field>
        <Field label="Special notes">
          <Textarea
            value={value.specialNotes}
            onChange={(event) => onChange({ ...value, specialNotes: event.target.value })}
            placeholder="Include any access notes, invoice details, or other context"
            className="min-h-20 rounded-2xl border-slate-200 bg-white"
          />
        </Field>
        <Button type="button" onClick={onSubmit} disabled={loading} className="rounded-2xl" style={{ backgroundColor: accentColor }}>
          {loading ? <Spinner className="h-4 w-4" /> : <Headphones className="h-4 w-4" />}
          Save and connect
        </Button>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</Label>
      {children}
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
      {message}
    </div>
  );
}

function ResultCard({
  title,
  referenceNumber,
  status,
  summary,
  nextStep,
}: {
  title: string;
  referenceNumber: string;
  status: string;
  summary: string;
  nextStep: string;
}) {
  return (
    <Card className="rounded-[24px] border-emerald-200 bg-emerald-50/70 shadow-sm">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">
              {title}
            </div>
            <div className="mt-1 text-lg font-semibold text-slate-900">{referenceNumber}</div>
          </div>
          <Badge className="rounded-full bg-emerald-600 text-white hover:bg-emerald-600">
            {status}
          </Badge>
        </div>
        <p className="text-sm leading-6 text-slate-700">{summary}</p>
        <p className="text-sm leading-6 text-slate-700">{nextStep}</p>
      </CardContent>
    </Card>
  );
}

function StatusResultCard({ response }: { response: CustomerJobLookupResponse }) {
  if (!response.found) {
    return (
      <Card className="rounded-[24px] border-slate-200 bg-white shadow-sm">
        <CardContent className="space-y-3 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Status result</div>
          <p className="text-sm leading-6 text-slate-700">{response.message}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-[24px] border-slate-200 bg-white shadow-sm">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
              {response.multiple_matches ? 'Multiple matches found' : 'Status result'}
            </div>
            <div className="mt-1 text-sm text-slate-700">{response.message}</div>
          </div>
        </div>
        <div className="space-y-3">
          {response.matches.map((item) => (
            <div key={`${item.reference_number}-${item.updated_at}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">{item.reference_number}</div>
                  <div className="text-xs text-slate-500">{item.summary}</div>
                </div>
                <Badge variant="outline" className="rounded-full border-slate-200 bg-white text-slate-700">
                  {item.status_label}
                </Badge>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-700">{item.next_step}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function InvoiceResultCard({ response }: { response: CustomerInvoiceLookupResponse }) {
  if (!response.found) {
    return (
      <Card className="rounded-[24px] border-slate-200 bg-white shadow-sm">
        <CardContent className="space-y-3 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Invoice result</div>
          <p className="text-sm leading-6 text-slate-700">{response.message}</p>
          <p className="text-sm leading-6 text-slate-500">
            If this is a dispute, payment issue, pricing exception, or missing invoice, use Talk to Agent.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-[24px] border-slate-200 bg-white shadow-sm">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Invoice result</div>
            <div className="mt-1 text-sm text-slate-700">{response.message}</div>
          </div>
        </div>
        <div className="space-y-3">
          {response.matches.map((item) => (
            <div key={`${item.invoice_number}-${item.updated_at}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">{item.invoice_number}</div>
                  <div className="text-xs text-slate-500">
                    {item.job_code ? `Job ${item.job_code}` : 'Job not listed'}
                  </div>
                </div>
                <Badge variant="outline" className="rounded-full border-slate-200 bg-white text-slate-700">
                  {item.status_label}
                </Badge>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-700">{item.summary}</p>
              <p className="mt-1 text-sm leading-6 text-slate-700">
                Total: {formatCurrency(item.total)}
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-700">{item.next_step}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusHint() {
  return (
    <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
      <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
        Customer-safe statuses
      </div>
      <div className="flex flex-wrap gap-2">
        {STATUS_HINTS.map((hint) => (
          <Badge key={hint} variant="outline" className="rounded-full border-slate-200 bg-slate-50 text-slate-600">
            {hint}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function InvoiceHint() {
  return (
    <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
      <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
        Invoice wording
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {INVOICE_HINTS.map((hint) => (
          <div key={hint.label} className="rounded-xl bg-slate-50 px-3 py-2">
            <div className="font-semibold text-slate-900">{hint.label}</div>
            <div className="text-xs text-slate-600">{hint.description}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
