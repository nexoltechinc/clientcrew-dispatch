import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BadgeInfo, CalendarCheck2, Headphones, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CustomerPortalShell } from '@/components/customer/CustomerPortalShell';
import { lookupCustomerJob, type CustomerJobLookupResponse } from '@/lib/customer-api';

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

export default function CustomerStatus() {
  const [jobCode, setJobCode] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<CustomerJobLookupResponse | null>(null);

  const submitLookup = async () => {
    if (!jobCode.trim() && !customerName.trim()) {
      setErrorMessage('Enter a job code first, or provide the account name with contact details.');
      return;
    }
    if (!jobCode.trim() && !contactEmail.trim() && !contactPhone.trim()) {
      setErrorMessage('Add an email or phone number to refine the lookup.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setResult(null);
    try {
      const response = await lookupCustomerJob({
        job_code: jobCode.trim() || null,
        customer_name: customerName.trim() || null,
        contact_email: contactEmail.trim() || null,
        contact_phone: contactPhone.trim() || null,
      });
      setResult(response);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to look up the job.');
    } finally {
      setLoading(false);
    }
  };

  const heroActions = (
    <>
      <Button asChild className="rounded-2xl">
        <Link to="/customer/request-service">
          <CalendarCheck2 className="h-4 w-4" />
          Request service
        </Link>
      </Button>
      <Button asChild variant="outline" className="rounded-2xl">
        <Link to="/customer/support">
          <Headphones className="h-4 w-4" />
          Invoice help
        </Link>
      </Button>
    </>
  );

  return (
    <CustomerPortalShell
      pageBadge="Status lookup"
      pageTitle="Check a job without exposing internal dispatch data"
      pageDescription="Start with the job code. If it is unavailable, use the dealership or account name together with an email or phone number."
      actions={heroActions}
      stats={[
        { label: 'Job code', value: 'First choice', detail: 'The customer-safe lookup path.' },
        { label: 'Fallback', value: 'Account details', detail: 'Use the dealership name plus email or phone.' },
        { label: 'Statuses', value: 'Plain language', detail: 'Only customer-friendly labels are shown.' },
        { label: 'Privacy', value: 'No internals', detail: 'No audit logs, confidence scores, or raw payloads.' },
      ]}
      sidebar={<SidebarCard />}
    >
      <Card className="rounded-[28px] border-white/80 bg-white/95 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
        <CardHeader className="border-b border-slate-100">
          <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 text-slate-600">
            Lookup form
          </Badge>
          <CardTitle className="text-2xl text-slate-950">Job status search</CardTitle>
          <CardDescription className="text-slate-600">
            The portal will only show the customer-safe status labels and a simple next step.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 p-6">
          {errorMessage ? (
            <div className="rounded-[24px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-900">
              {errorMessage}
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Job code">
              <Input
                value={jobCode}
                onChange={(event) => setJobCode(event.target.value)}
                className="h-11 rounded-2xl border-slate-200 bg-slate-50"
                placeholder="Ask the customer for the code first"
              />
            </Field>
            <Field label="Account / dealership name">
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

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button onClick={() => void submitLookup()} disabled={loading} className="rounded-2xl">
              {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <BadgeInfo className="h-4 w-4" />}
              Check Status
            </Button>
            <Button asChild variant="outline" className="rounded-2xl">
              <Link to="/customer/services">Browse services</Link>
            </Button>
          </div>

          {result ? <StatusResultCard response={result} /> : null}
        </CardContent>
      </Card>
    </CustomerPortalShell>
  );
}

function StatusResultCard({ response }: { response: CustomerJobLookupResponse }) {
  if (!response.found) {
    return (
      <Card className="rounded-[24px] border-slate-200 bg-slate-50">
        <CardContent className="space-y-3 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Lookup result</div>
          <p className="text-sm leading-6 text-slate-700">{response.message}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-[24px] border-slate-200 bg-white shadow-sm">
      <CardContent className="space-y-4 p-5">
        <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{response.message}</div>
        <div className="space-y-3">
          {response.matches.map((item) => (
            <div key={`${item.reference_number}-${item.updated_at}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-950">{item.reference_number}</div>
                  <div className="text-xs text-slate-500">{item.summary}</div>
                </div>
                <Badge variant="outline" className="rounded-full border-slate-200 bg-white text-slate-700">
                  {item.status_label}
                </Badge>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-700">{item.next_step}</p>
            </div>
          ))}
        </div>
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
          Status legend
        </Badge>
        <CardTitle className="text-xl text-slate-950">Customer-safe status labels</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 p-6">
        {STATUS_HINTS.map((status) => (
          <div key={status} className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
            {status}
          </div>
        ))}
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Internal dispatch fields stay hidden. Customers only see what they need to know next.
        </div>
      </CardContent>
    </Card>
  );
}
