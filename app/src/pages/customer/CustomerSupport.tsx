import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  CalendarCheck2,
  BadgeInfo,
  Headphones,
  RefreshCw,
  Wrench,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { CustomerPortalShell } from '@/components/customer/CustomerPortalShell';
import {
  lookupCustomerInvoice,
  submitCustomerServiceRequest,
  type CustomerInvoiceLookupResponse,
} from '@/lib/customer-api';
import {
  clearCustomerPortalDraft,
  saveCustomerPortalDraft,
} from '@/lib/customer-session';
import { useCustomerPortal } from '@/components/customer/customer-portal-context';

const supportSchema = z
  .object({
    customerName: z.string().trim().min(2, 'Enter the dealership or customer name.'),
    contactPerson: z.string().trim().min(2, 'Enter the contact person.'),
    phone: z.string().trim(),
    email: z.string().trim(),
    invoiceNumber: z.string().trim(),
    jobCode: z.string().trim(),
    serviceLocationOrBranch: z.string().trim(),
    issueSummary: z.string().trim().min(3, 'Tell dispatch what you need help with.'),
    urgency: z.enum(['low', 'medium', 'high', 'critical']),
    specialNotes: z.string().trim(),
  })
  .superRefine((value, context) => {
    if (!value.phone.trim() && !value.email.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['phone'],
        message: 'Enter a phone number or email address.',
      });
    }
  });

type SupportFormValues = z.infer<typeof supportSchema>;

const supportDefaults = (): SupportFormValues => ({
  customerName: '',
  contactPerson: '',
  phone: '',
  email: '',
  invoiceNumber: '',
  jobCode: '',
  serviceLocationOrBranch: '',
  issueSummary: '',
  urgency: 'high',
  specialNotes: '',
});

export default function CustomerSupport() {
  const { setLastReferenceNumber, sessionId } = useCustomerPortal();
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [jobCode, setJobCode] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [loadingInvoice, setLoadingInvoice] = useState(false);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [invoiceResult, setInvoiceResult] = useState<CustomerInvoiceLookupResponse | null>(null);

  const supportForm = useForm<SupportFormValues>({
    resolver: zodResolver(supportSchema),
    defaultValues: supportDefaults(),
    mode: 'onBlur',
  });

  const { watch, setValue, handleSubmit, reset, formState } = supportForm;
  const supportValues = watch();
  const [loadingSupport, setLoadingSupport] = useState(false);
  const [supportSuccess, setSupportSuccess] = useState<string | null>(null);
  const [supportReference, setSupportReference] = useState<string | null>(null);

  useEffect(() => {
    const subscription = watch((values) => {
      saveCustomerPortalDraft({ supportDraft: values, invoiceLookup: { invoiceNumber, jobCode, customerName, contactEmail, contactPhone }, sessionId });
    });
    return () => subscription.unsubscribe();
  }, [contactEmail, contactPhone, customerName, invoiceNumber, jobCode, sessionId, watch]);

  const submitInvoiceLookup = async () => {
    if (!invoiceNumber.trim() && !jobCode.trim()) {
      setInvoiceError('Enter an invoice number or job code.');
      return;
    }

    setLoadingInvoice(true);
    setInvoiceError(null);
    setInvoiceResult(null);
    try {
      const response = await lookupCustomerInvoice({
        invoice_number: invoiceNumber.trim() || null,
        job_code: jobCode.trim() || null,
        customer_name: customerName.trim() || null,
        contact_email: contactEmail.trim() || null,
        contact_phone: contactPhone.trim() || null,
      });
      setInvoiceResult(response);
      if (response.matches[0]?.invoice_number) {
        setLastReferenceNumber(response.matches[0].invoice_number);
      }
    } catch (error) {
      setInvoiceError(error instanceof Error ? error.message : 'Unable to look up the invoice.');
    } finally {
      setLoadingInvoice(false);
    }
  };

  const submitSupport = handleSubmit(async (values) => {
    setLoadingSupport(true);
    setSupportSuccess(null);
    try {
      const now = new Date();
      const response = await submitCustomerServiceRequest({
        customer_name: values.customerName.trim(),
        contact_person: values.contactPerson.trim(),
        phone: values.phone.trim() || null,
        email: values.email.trim() || null,
        vehicle_description: 'Support request',
        vehicle_unit_or_stock_number: values.invoiceNumber.trim() || values.jobCode.trim() || null,
        requested_services: [],
        requested_service_text: values.issueSummary.trim(),
        preferred_date: now.toISOString().slice(0, 10),
        preferred_time: now.toTimeString().slice(0, 5),
        service_location_or_branch: values.serviceLocationOrBranch.trim() || null,
        urgency: values.urgency,
        special_notes: [
          values.specialNotes.trim(),
          values.invoiceNumber.trim() ? `Invoice number: ${values.invoiceNumber.trim()}` : '',
          values.jobCode.trim() ? `Job code: ${values.jobCode.trim()}` : '',
        ].filter(Boolean).join(' | '),
        portal_session_id: sessionId,
        idempotency_key: `${sessionId}-${values.customerName.trim().toLowerCase().replace(/\s+/g, '-')}-support`,
        source_channel: 'customer_portal',
      });

      setSupportReference(response.reference_number);
      setLastReferenceNumber(response.reference_number);
      setSupportSuccess(
        response.agent_available
          ? response.next_step
          : 'Our team is not available right now, but your request has been saved and dispatch will follow up.',
      );
      clearCustomerPortalDraft();
      reset(supportDefaults());
    } catch (error) {
      setSupportSuccess(error instanceof Error ? error.message : 'Unable to save the support request.');
    } finally {
      setLoadingSupport(false);
    }
  });

  const heroActions = (
    <>
      <Button asChild className="rounded-2xl">
        <Link to="/customer/request-service">
          <CalendarCheck2 className="h-4 w-4" />
          Request service
        </Link>
      </Button>
      <Button asChild variant="outline" className="rounded-2xl">
        <Link to="/customer/status">
          <Wrench className="h-4 w-4" />
          Check status
        </Link>
      </Button>
    </>
  );

  return (
    <CustomerPortalShell
      pageBadge="Support"
      pageTitle="Ask about invoices or connect with dispatch"
      pageDescription="Use the invoice lookup first when you have a number. If the issue needs a human, send a support request and dispatch/admin will review it."
      actions={heroActions}
      stats={[
        { label: 'Invoice status', value: 'Customer-safe', detail: 'Draft, Sent, Paid, Overdue, or Cancelled.' },
        { label: 'Escalation', value: 'Human handoff', detail: 'Disputes and missing invoices route to dispatch/admin.' },
        { label: 'No login', value: 'Public access', detail: 'Nothing here requires a customer account login.' },
        { label: 'Reference', value: 'Saved on submit', detail: 'Every support request returns a reference number.' },
      ]}
      sidebar={<SidebarCard />}
    >
      <Card className="rounded-[28px] border-white/80 bg-white/95 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
        <CardHeader className="border-b border-slate-100">
          <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 text-slate-600">
            Invoice help
          </Badge>
          <CardTitle className="text-2xl text-slate-950">Help center</CardTitle>
          <CardDescription className="text-slate-600">
            Look up an invoice, then use the support request tab if the customer needs a human to review the issue.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 p-6">
          {supportSuccess ? (
            <ConfirmationCard referenceNumber={supportReference} message={supportSuccess} />
          ) : null}

          <Tabs defaultValue="invoice" className="space-y-5">
            <TabsList className="grid w-full grid-cols-2 rounded-2xl bg-slate-100 p-1">
              <TabsTrigger value="invoice" className="rounded-xl">
                Invoice lookup
              </TabsTrigger>
              <TabsTrigger value="support" className="rounded-xl">
                Talk to agent
              </TabsTrigger>
            </TabsList>

            <TabsContent value="invoice" className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Invoice number">
                  <Input
                    value={invoiceNumber}
                    onChange={(event) => setInvoiceNumber(event.target.value)}
                    className="h-11 rounded-2xl border-slate-200 bg-slate-50"
                  />
                </Field>
                <Field label="Job code">
                  <Input
                    value={jobCode}
                    onChange={(event) => setJobCode(event.target.value)}
                    className="h-11 rounded-2xl border-slate-200 bg-slate-50"
                  />
                </Field>
                <Field label="Dealership or account name">
                  <Input
                    value={customerName}
                    onChange={(event) => setCustomerName(event.target.value)}
                    className="h-11 rounded-2xl border-slate-200 bg-slate-50"
                  />
                </Field>
                <Field label="Email">
                  <Input
                    value={contactEmail}
                    onChange={(event) => setContactEmail(event.target.value)}
                    className="h-11 rounded-2xl border-slate-200 bg-slate-50"
                  />
                </Field>
                <Field label="Phone">
                  <Input
                    value={contactPhone}
                    onChange={(event) => setContactPhone(event.target.value)}
                    className="h-11 rounded-2xl border-slate-200 bg-slate-50"
                  />
                </Field>
              </div>
              {invoiceError ? (
                <div className="rounded-[24px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-900">
                  {invoiceError}
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={() => void submitInvoiceLookup()} disabled={loadingInvoice} className="rounded-2xl">
                  {loadingInvoice ? <RefreshCw className="h-4 w-4 animate-spin" /> : <BadgeInfo className="h-4 w-4" />}
                  Look up invoice
                </Button>
                <Button asChild variant="outline" className="rounded-2xl">
                  <Link to="/customer/status">Check job status</Link>
                </Button>
              </div>

              <InvoiceLookupGuidance />
              {invoiceResult ? <InvoiceResultCard response={invoiceResult} /> : null}
            </TabsContent>

            <TabsContent value="support" className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Customer or dealership name">
                  <Input
                    value={supportValues.customerName}
                    onChange={(event) => setValue('customerName', event.target.value, { shouldDirty: true })}
                    className="h-11 rounded-2xl border-slate-200 bg-slate-50"
                  />
                </Field>
                <Field label="Contact person">
                  <Input
                    value={supportValues.contactPerson}
                    onChange={(event) => setValue('contactPerson', event.target.value, { shouldDirty: true })}
                    className="h-11 rounded-2xl border-slate-200 bg-slate-50"
                  />
                </Field>
                <Field label="Phone">
                  <Input
                    value={supportValues.phone}
                    onChange={(event) => setValue('phone', event.target.value, { shouldDirty: true })}
                    className="h-11 rounded-2xl border-slate-200 bg-slate-50"
                  />
                </Field>
                <Field label="Email">
                  <Input
                    value={supportValues.email}
                    onChange={(event) => setValue('email', event.target.value, { shouldDirty: true })}
                    className="h-11 rounded-2xl border-slate-200 bg-slate-50"
                  />
                </Field>
                <Field label="Invoice number, optional">
                  <Input
                    value={supportValues.invoiceNumber}
                    onChange={(event) => setValue('invoiceNumber', event.target.value, { shouldDirty: true })}
                    className="h-11 rounded-2xl border-slate-200 bg-slate-50"
                  />
                </Field>
                <Field label="Job code, optional">
                  <Input
                    value={supportValues.jobCode}
                    onChange={(event) => setValue('jobCode', event.target.value, { shouldDirty: true })}
                    className="h-11 rounded-2xl border-slate-200 bg-slate-50"
                  />
                </Field>
                <Field label="Branch or location">
                  <Input
                    value={supportValues.serviceLocationOrBranch}
                    onChange={(event) => setValue('serviceLocationOrBranch', event.target.value, { shouldDirty: true })}
                    className="h-11 rounded-2xl border-slate-200 bg-slate-50"
                  />
                </Field>
                <Field label="Urgency">
                  <select
                    value={supportValues.urgency}
                    onChange={(event) => setValue('urgency', event.target.value as SupportFormValues['urgency'], { shouldDirty: true })}
                    className="h-11 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-[color:var(--customer-primary)]"
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
                  value={supportValues.issueSummary}
                  onChange={(event) => setValue('issueSummary', event.target.value, { shouldDirty: true })}
                  placeholder="Invoice question, payment issue, missing invoice, or pricing exception"
                  className="min-h-24 rounded-2xl border-slate-200 bg-slate-50"
                />
              </Field>
              <Field label="Special notes">
                <Textarea
                  value={supportValues.specialNotes}
                  onChange={(event) => setValue('specialNotes', event.target.value, { shouldDirty: true })}
                  placeholder="Any extra context or access instructions"
                  className="min-h-24 rounded-2xl border-slate-200 bg-slate-50"
                />
              </Field>
              {Object.keys(formState.errors).length > 0 ? (
                <div className="rounded-[24px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-900">
                  Please fill in the required contact details before submitting.
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={() => void submitSupport()} disabled={loadingSupport} className="rounded-2xl">
                  {loadingSupport ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Headphones className="h-4 w-4" />}
                  Save and connect
                </Button>
                <Button asChild variant="outline" className="rounded-2xl">
                  <Link to="/customer/request-service">Request service</Link>
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </CustomerPortalShell>
  );
}

function InvoiceResultCard({ response }: { response: CustomerInvoiceLookupResponse }) {
  if (!response.found) {
    return (
      <Card className="rounded-[24px] border-slate-200 bg-slate-50">
        <CardContent className="space-y-3 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Invoice result</div>
          <p className="text-sm leading-6 text-slate-700">{response.message}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-[24px] border-slate-200 bg-white shadow-sm">
      <CardContent className="space-y-3 p-5">
        <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{response.message}</div>
        {response.matches.map((item) => (
          <div key={`${item.invoice_number}-${item.updated_at}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-950">{item.invoice_number}</div>
                <div className="text-xs text-slate-500">{item.job_code ? `Job ${item.job_code}` : 'Job not listed'}</div>
              </div>
              <Badge variant="outline" className="rounded-full border-slate-200 bg-white text-slate-700">
                {item.status_label}
              </Badge>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-700">{item.summary}</p>
            <p className="mt-1 text-sm leading-6 text-slate-700">{item.next_step}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function InvoiceLookupGuidance() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {[
        { label: 'Draft', description: 'invoice is being prepared' },
        { label: 'Sent', description: 'invoice has been issued' },
        { label: 'Paid', description: 'payment was recorded' },
        { label: 'Overdue', description: 'due date has passed' },
        { label: 'Cancelled', description: 'invoice is no longer active' },
      ].map((item) => (
        <div key={item.label} className="rounded-[22px] border border-slate-100 bg-slate-50/80 p-4">
          <div className="text-sm font-semibold text-slate-950">{item.label}</div>
          <div className="mt-1 text-sm leading-6 text-slate-600">{item.description}</div>
        </div>
      ))}
    </div>
  );
}

function ConfirmationCard({
  referenceNumber,
  message,
}: {
  referenceNumber: string | null;
  message: string;
}) {
  return (
    <Card className="rounded-[24px] border-emerald-200 bg-emerald-50">
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center gap-2 text-emerald-800">
          <Badge variant="outline" className="rounded-full border-emerald-200 bg-white text-emerald-700">
            Saved
          </Badge>
          {referenceNumber ? <span className="text-lg font-semibold text-slate-950">{referenceNumber}</span> : null}
        </div>
        <p className="text-sm leading-6 text-slate-700">{message}</p>
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

function SidebarCard() {
  return (
    <Card className="rounded-[28px] border-white/80 bg-white/95 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
      <CardHeader className="border-b border-slate-100">
        <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 text-slate-600">
          Status guide
        </Badge>
        <CardTitle className="text-xl text-slate-950">When to hand off to a human</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-6 text-sm leading-6 text-slate-600">
        <div className="rounded-2xl bg-slate-50 px-4 py-3">Disputes, missing invoices, payment issues, or pricing exceptions.</div>
        <div className="rounded-2xl bg-slate-50 px-4 py-3">If the invoice is not found or the customer needs more billing detail.</div>
        <div className="rounded-2xl bg-slate-50 px-4 py-3">If the customer wants help from dispatch/admin instead of self-service lookup.</div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900">
          The portal saves a reference number and keeps the conversation customer-safe.
        </div>
      </CardContent>
    </Card>
  );
}
