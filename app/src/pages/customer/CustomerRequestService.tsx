import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarCheck2, CheckCircle2, Headphones, Wrench } from 'lucide-react';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type UseFormSetValue } from 'react-hook-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { CustomerPortalShell } from '@/components/customer/CustomerPortalShell';
import { fetchCustomerServices, submitCustomerServiceRequest, type CustomerServiceCatalogItem } from '@/lib/customer-api';
import {
  CUSTOMER_SERVICE_FAMILIES,
  normalizeCustomerServiceSelection,
  type CustomerServiceFamily,
} from '@/lib/customer-service-matcher';
import {
  clearCustomerPortalDraft,
  loadCustomerPortalDraft,
  saveCustomerPortalDraft,
} from '@/lib/customer-session';
import { useCustomerPortal } from '@/components/customer/customer-portal-context';
import { cn } from '@/lib/utils';

const requestSchema = z
  .object({
    serviceText: z.string().trim(),
    selectedServices: z.array(z.string()),
    customerName: z.string().trim().min(2, 'Enter the dealership or customer name.'),
    contactPerson: z.string().trim().min(2, 'Enter the contact person.'),
    phone: z.string().trim(),
    email: z.string().trim(),
    vehicleDescription: z.string().trim().min(2, 'Enter the vehicle description.'),
    vehicleUnitOrStockNumber: z.string().trim(),
    preferredDate: z.string().min(1, 'Choose a preferred date.'),
    preferredTime: z.string().min(1, 'Choose a preferred time.'),
    serviceLocationOrBranch: z.string().trim(),
    urgency: z.enum(['low', 'medium', 'high', 'critical']),
    specialNotes: z.string().trim(),
  })
  .superRefine((value, context) => {
    if (!value.serviceText.trim() && value.selectedServices.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['serviceText'],
        message: 'Describe the service or choose at least one family.',
      });
    }

    if (!value.phone.trim() && !value.email.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['phone'],
        message: 'Enter a phone number or email address.',
      });
    }

    const selectedDate = new Date(`${value.preferredDate}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (Number.isNaN(selectedDate.getTime()) || selectedDate < today) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['preferredDate'],
        message: 'Choose today or a future date.',
      });
    }
  });

type RequestFormValues = z.infer<typeof requestSchema>;

type StepId = 1 | 2 | 3;

const defaultValues = (): RequestFormValues => ({
  serviceText: '',
  selectedServices: [],
  customerName: '',
  contactPerson: '',
  phone: '',
  email: '',
  vehicleDescription: '',
  vehicleUnitOrStockNumber: '',
  preferredDate: new Date().toISOString().slice(0, 10),
  preferredTime: new Date().toTimeString().slice(0, 5),
  serviceLocationOrBranch: '',
  urgency: 'medium',
  specialNotes: '',
});

function toNumber(value: string | number) {
  return typeof value === 'number' ? value : Number(value);
}

function getFamilyForService(row: CustomerServiceCatalogItem): CustomerServiceFamily | null {
  const match = normalizeCustomerServiceSelection(
    `${row.name} ${row.category} ${row.description ?? ''}`,
  ).matchedFamilies[0];
  return match ?? null;
}

export default function CustomerRequestService() {
  const { setLastReferenceNumber, sessionId } = useCustomerPortal();
  const [step, setStep] = useState<StepId>(1);
  const [services, setServices] = useState<CustomerServiceCatalogItem[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [referenceNumber, setReferenceNumber] = useState<string | null>(null);
  const [confirmationMessage, setConfirmationMessage] = useState<string | null>(null);
  const submitModeRef = useRef<'request' | 'agent'>('request');
  const submitIdRef = useRef<string>(`${sessionId}-${Date.now()}`);

  const form = useForm<RequestFormValues>({
    resolver: zodResolver(requestSchema),
    defaultValues: defaultValues(),
    mode: 'onBlur',
  });

  const { watch, setValue, trigger, handleSubmit, reset, formState } = form;
  const watchedValues = watch();

  useEffect(() => {
    const draft = loadCustomerPortalDraft<Record<string, unknown>>();
    if (!draft || !draft.requestDraft || typeof draft.requestDraft !== 'object') {
      return;
    }

    const requestDraft = draft.requestDraft as Partial<RequestFormValues>;
    reset({
      ...defaultValues(),
      ...requestDraft,
    });
  }, [reset]);

  useEffect(() => {
    const subscription = watch((values) => {
      saveCustomerPortalDraft({ requestDraft: values, source: 'request-page', sessionId });
    });
    return () => subscription.unsubscribe();
  }, [sessionId, watch]);

  useEffect(() => {
    let active = true;
    const loadCatalog = async () => {
      setLoadingCatalog(true);
      setCatalogError(null);
      try {
        const rows = await fetchCustomerServices();
        if (!active) {
          return;
        }
        setServices(rows);
      } catch (error) {
        if (!active) {
          return;
        }
        setCatalogError(error instanceof Error ? error.message : 'Unable to load the live catalog.');
        setServices([]);
      } finally {
        if (active) {
          setLoadingCatalog(false);
        }
      }
    };

    void loadCatalog();

    return () => {
      active = false;
    };
  }, []);

  const normalizedSelection = useMemo(
    () => normalizeCustomerServiceSelection(watchedValues.serviceText, services),
    [services, watchedValues.serviceText],
  );

  const familySummary = useMemo(() => {
    return CUSTOMER_SERVICE_FAMILIES.map((family) => {
      const familyServices = services.filter((service) => getFamilyForService(service)?.key === family.key);
      const prices = familyServices
        .map((service) => toNumber(service.default_price))
        .filter((value) => Number.isFinite(value));
      return {
        family,
        count: familyServices.length,
        basePrice: prices.length > 0 ? Math.min(...prices) : null,
      };
    });
  }, [services]);

  const selectedFamilies = watchedValues.selectedServices;

  const handleToggleFamily = (label: string) => {
    const exists = selectedFamilies.includes(label);
    setValue(
      'selectedServices',
      exists ? selectedFamilies.filter((item) => item !== label) : [...selectedFamilies, label],
      { shouldDirty: true, shouldTouch: true },
    );
  };

  const goToStep = async (nextStep: StepId) => {
    if (step === 1 && nextStep > step) {
      const valid = await trigger(['serviceText', 'selectedServices']);
      if (!valid) {
        return;
      }
    }
    if (step === 2 && nextStep > step) {
      const valid = await trigger([
        'customerName',
        'contactPerson',
        'phone',
        'email',
        'vehicleDescription',
        'preferredDate',
        'preferredTime',
      ]);
      if (!valid) {
        return;
      }
    }
    setStep(nextStep);
  };

  const onSubmit = handleSubmit(async (values) => {
    setIsSubmitting(true);
    setConfirmationMessage(null);
    try {
      const selectedFamiliesFromText = normalizeCustomerServiceSelection(values.serviceText, services);
      const requestedServices =
        values.selectedServices.length > 0
          ? values.selectedServices
          : selectedFamiliesFromText.matchedServiceNames.length > 0
            ? selectedFamiliesFromText.matchedServiceNames
            : selectedFamiliesFromText.matchedFamilies.map((family) => family.label);

      const response = await submitCustomerServiceRequest({
        customer_name: values.customerName.trim(),
        contact_person: values.contactPerson.trim(),
        phone: values.phone.trim() || null,
        email: values.email.trim() || null,
        vehicle_description: values.vehicleDescription.trim(),
        vehicle_unit_or_stock_number: values.vehicleUnitOrStockNumber.trim() || null,
        requested_services: requestedServices,
        requested_service_text: values.serviceText.trim() || null,
        preferred_date: values.preferredDate,
        preferred_time: values.preferredTime,
        service_location_or_branch: values.serviceLocationOrBranch.trim() || null,
        urgency: values.urgency,
        special_notes: [
          values.specialNotes.trim(),
          submitModeRef.current === 'agent' ? 'Customer requested agent review first.' : '',
        ].filter(Boolean).join(' | '),
        portal_session_id: sessionId,
        idempotency_key: submitIdRef.current,
        source_channel: 'booking_form',
      });

      setReferenceNumber(response.reference_number);
      setLastReferenceNumber(response.reference_number);
      setConfirmationMessage(
        response.agent_available
          ? response.next_step
          : 'Our team is not available right now, but your request has been saved and dispatch will follow up.',
      );
      clearCustomerPortalDraft();
      submitIdRef.current = `${sessionId}-${Date.now()}`;
      reset(defaultValues());
      setStep(1);
    } catch (error) {
      setConfirmationMessage(error instanceof Error ? error.message : 'Unable to submit the request.');
    } finally {
      setIsSubmitting(false);
    }
  });

  const heroActions = (
    <>
      <Button asChild className="rounded-2xl">
        <Link to="/customer/services">
          <Wrench className="h-4 w-4" />
          Browse catalog
        </Link>
      </Button>
      <Button asChild variant="outline" className="rounded-2xl">
        <Link to="/customer/support">
          <Headphones className="h-4 w-4" />
          Talk to agent
        </Link>
      </Button>
    </>
  );

  return (
    <CustomerPortalShell
      pageBadge="Request service"
      pageTitle="Capture a service request or appointment inquiry"
      pageDescription="Select a service family, add customer and vehicle details, and submit a reference-number-backed intake request for dispatch review."
      actions={heroActions}
      stats={[
        { label: 'Step 1', value: 'Service', detail: 'Tell us what you need in your own words.' },
        { label: 'Step 2', value: 'Details', detail: 'Add the customer, vehicle, and preferred timing.' },
        { label: 'Step 3', value: 'Review', detail: 'Confirm before dispatch/admin receives it.' },
        { label: 'Reference', value: 'Saved on submit', detail: 'The portal returns a customer-safe reference number.' },
      ]}
      sidebar={<SidebarCard />}
    >
      <Card className="rounded-[28px] border-white/80 bg-white/95 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
        <CardHeader className="space-y-3 border-b border-slate-100">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 text-slate-600">
              Step {step} of 3
            </Badge>
            {referenceNumber ? (
              <Badge className="rounded-full bg-emerald-600 text-white hover:bg-emerald-600">
                Ref {referenceNumber}
              </Badge>
            ) : null}
            {catalogError ? (
              <Badge variant="outline" className="rounded-full border-amber-200 bg-amber-50 text-amber-700">
                Catalog unavailable
              </Badge>
            ) : null}
          </div>
          <CardTitle className="text-2xl text-slate-950">Service request wizard</CardTitle>
          <CardDescription className="text-slate-600">
            The portal can normalize free-text service requests into known families when possible. If it is unclear, it will ask a follow-up question instead of guessing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 p-6">
          {confirmationMessage ? (
            <ConfirmationCard referenceNumber={referenceNumber} message={confirmationMessage} />
          ) : null}

          {step === 1 ? (
            <StepOne
              loadingCatalog={loadingCatalog}
              catalogError={catalogError}
              services={services}
              familySummary={familySummary}
              selectedFamilies={selectedFamilies}
              normalizedSelection={normalizedSelection}
              toggleFamily={handleToggleFamily}
              setValue={setValue}
              value={watchedValues}
            />
          ) : null}

          {step === 2 ? (
            <StepTwo
              form={{
                watch: watchedValues,
                setValue,
              }}
              errorCount={Object.keys(formState.errors).length}
            />
          ) : null}

          {step === 3 ? (
            <StepThree
              value={watchedValues}
              services={services}
              onBack={() => setStep(2)}
              onSubmit={() => {
                submitModeRef.current = 'request';
                void onSubmit();
              }}
              onAgentFirst={() => {
                submitModeRef.current = 'agent';
                void onSubmit();
              }}
              loading={isSubmitting}
            />
          ) : null}

          <Separator />

          <div className="flex flex-wrap items-center gap-3">
            {step > 1 ? (
              <Button type="button" variant="outline" className="rounded-2xl" onClick={() => setStep((current) => (current - 1) as StepId)}>
                Back
              </Button>
            ) : null}
            {step < 3 ? (
              <Button type="button" className="rounded-2xl" onClick={() => void goToStep((step + 1) as StepId)}>
                Next
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </CustomerPortalShell>
  );
}

function StepOne({
  loadingCatalog,
  catalogError,
  services,
  familySummary,
  selectedFamilies,
  normalizedSelection,
  toggleFamily,
  setValue,
  value,
}: {
  loadingCatalog: boolean;
  catalogError: string | null;
  services: CustomerServiceCatalogItem[];
  familySummary: Array<{ family: CustomerServiceFamily; count: number; basePrice: number | null }>;
  selectedFamilies: string[];
  normalizedSelection: ReturnType<typeof normalizeCustomerServiceSelection>;
  toggleFamily: (label: string) => void;
  setValue: UseFormSetValue<RequestFormValues>;
  value: RequestFormValues;
}) {
  return (
    <div className="space-y-5">
      {catalogError ? (
        <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          Live catalog data could not be loaded, but the request form remains available.
        </div>
      ) : null}

      <Card className="rounded-[24px] border-slate-200 bg-slate-50/80 shadow-sm">
        <CardContent className="space-y-4 p-5">
          <Field label="Describe the service">
            <Textarea
              value={value.serviceText}
              onChange={(event) => setValue('serviceText', event.target.value, { shouldDirty: true, shouldTouch: true })}
              placeholder="Tell us what the customer needs in their own words"
              className="min-h-24 rounded-2xl border-slate-200 bg-white"
            />
          </Field>

          <div className="flex flex-wrap gap-2">
            {CUSTOMER_SERVICE_FAMILIES.map((family) => {
              const active = selectedFamilies.includes(family.label);
              return (
                <button
                  key={family.key}
                  type="button"
                  onClick={() => toggleFamily(family.label)}
                  className={cn(
                    'rounded-full border px-4 py-2 text-sm font-medium transition',
                    active
                      ? 'border-[color:var(--customer-primary)] bg-[rgba(47,142,146,0.1)] text-slate-950'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100',
                  )}
                >
                  {family.label}
                </button>
              );
            })}
          </div>

          {loadingCatalog ? <Skeleton className="h-14 rounded-2xl" /> : null}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {familySummary.map((item) => (
              <button
                key={item.family.key}
                type="button"
                onClick={() => toggleFamily(item.family.label)}
                className={cn(
                  'rounded-[22px] border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md',
                  selectedFamilies.includes(item.family.label)
                    ? 'border-[color:var(--customer-primary)] bg-[rgba(47,142,146,0.08)]'
                    : 'border-slate-100 bg-slate-50/80',
                )}
              >
                <div className="text-sm font-semibold text-slate-950">{item.family.label}</div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{item.family.description}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="rounded-full border-slate-200 bg-white text-slate-600">
                    {item.count} item{item.count === 1 ? '' : 's'}
                  </Badge>
                  <Badge variant="outline" className="rounded-full border-slate-200 bg-white text-slate-600">
                    {item.basePrice !== null ? `From ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(item.basePrice)}` : 'Awaiting price'}
                  </Badge>
                </div>
              </button>
            ))}
          </div>

          {normalizedSelection.matchedFamilies.length > 0 ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900">
              I matched your text to {normalizedSelection.matchedFamilies.map((family) => family.label).join(', ')}.
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="rounded-[24px] border-slate-200 bg-white">
          <CardContent className="p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
              If the request is unclear
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Ask one follow-up question rather than guessing the service. Dispatch can review the final intake.
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-slate-200 bg-white">
          <CardContent className="p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
              Customer-safe pricing
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              The request page does not promise a final total. Use the services page for base catalog price only.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StepTwo({
  form,
  errorCount,
}: {
  form: {
    watch: RequestFormValues;
    setValue: UseFormSetValue<RequestFormValues>;
  };
  errorCount: number;
}) {
  const { watch, setValue } = form;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Customer or dealership name">
          <Input
            value={watch.customerName}
            onChange={(event) => setValue('customerName', event.target.value, { shouldDirty: true })}
            className="h-11 rounded-2xl border-slate-200 bg-slate-50"
          />
        </Field>
        <Field label="Contact person">
          <Input
            value={watch.contactPerson}
            onChange={(event) => setValue('contactPerson', event.target.value, { shouldDirty: true })}
            className="h-11 rounded-2xl border-slate-200 bg-slate-50"
          />
        </Field>
        <Field label="Phone">
          <Input
            value={watch.phone}
            onChange={(event) => setValue('phone', event.target.value, { shouldDirty: true })}
            className="h-11 rounded-2xl border-slate-200 bg-slate-50"
          />
        </Field>
        <Field label="Email">
          <Input
            value={watch.email}
            onChange={(event) => setValue('email', event.target.value, { shouldDirty: true })}
            className="h-11 rounded-2xl border-slate-200 bg-slate-50"
          />
        </Field>
        <Field label="Vehicle description">
          <Input
            value={watch.vehicleDescription}
            onChange={(event) => setValue('vehicleDescription', event.target.value, { shouldDirty: true })}
            className="h-11 rounded-2xl border-slate-200 bg-slate-50"
          />
        </Field>
        <Field label="Vehicle unit or stock number, optional">
          <Input
            value={watch.vehicleUnitOrStockNumber}
            onChange={(event) => setValue('vehicleUnitOrStockNumber', event.target.value, { shouldDirty: true })}
            className="h-11 rounded-2xl border-slate-200 bg-slate-50"
          />
        </Field>
        <Field label="Preferred date">
          <Input
            type="date"
            min={new Date().toISOString().slice(0, 10)}
            value={watch.preferredDate}
            onChange={(event) => setValue('preferredDate', event.target.value, { shouldDirty: true })}
            className="h-11 rounded-2xl border-slate-200 bg-slate-50"
          />
        </Field>
        <Field label="Preferred time">
          <Input
            type="time"
            value={watch.preferredTime}
            onChange={(event) => setValue('preferredTime', event.target.value, { shouldDirty: true })}
            className="h-11 rounded-2xl border-slate-200 bg-slate-50"
          />
        </Field>
        <Field label="Service location or branch">
          <Input
            value={watch.serviceLocationOrBranch}
            onChange={(event) => setValue('serviceLocationOrBranch', event.target.value, { shouldDirty: true })}
            className="h-11 rounded-2xl border-slate-200 bg-slate-50"
          />
        </Field>
        <Field label="Urgency">
          <select
            value={watch.urgency}
            onChange={(event) => setValue('urgency', event.target.value as RequestFormValues['urgency'], { shouldDirty: true })}
            className="h-11 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-[color:var(--customer-primary)]"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </Field>
      </div>
      <Field label="Special notes or access instructions">
        <Textarea
          value={watch.specialNotes}
          onChange={(event) => setValue('specialNotes', event.target.value, { shouldDirty: true })}
          placeholder="Gate codes, parking instructions, or other access details"
          className="min-h-24 rounded-2xl border-slate-200 bg-slate-50"
        />
      </Field>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Validation errors are shown inline. {errorCount > 0 ? `${errorCount} field(s) still need attention.` : 'Everything is ready to review.'}
      </div>
    </div>
  );
}

function StepThree({
  value,
  services,
  onBack,
  onSubmit,
  onAgentFirst,
  loading,
}: {
  value: RequestFormValues;
  services: CustomerServiceCatalogItem[];
  onBack: () => void;
  onSubmit: () => void;
  onAgentFirst: () => void;
  loading: boolean;
}) {
  const normalized = normalizeCustomerServiceSelection(value.serviceText, services);

  return (
    <div className="space-y-5">
      <Card className="rounded-[24px] border-slate-200 bg-slate-50/80">
        <CardHeader>
          <CardTitle className="text-xl text-slate-950">Review the request</CardTitle>
          <CardDescription className="text-slate-600">
            Confirm the customer details before dispatch/admin reviews the intake.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Summary label="Service request" value={value.serviceText || value.selectedServices.join(', ')} />
          <Summary label="Matches" value={normalized.matchedFamilies.length > 0 ? normalized.matchedFamilies.map((item) => item.label).join(', ') : 'Manual review'} />
          <Summary label="Customer" value={value.customerName} />
          <Summary label="Contact" value={`${value.contactPerson}${value.phone ? `, ${value.phone}` : ''}${value.email ? `, ${value.email}` : ''}`} />
          <Summary label="Vehicle" value={value.vehicleDescription} />
          <Summary label="Preferred schedule" value={`${value.preferredDate} at ${value.preferredTime}`} />
          <Summary label="Branch" value={value.serviceLocationOrBranch || 'Not specified'} />
          <Summary label="Urgency" value={value.urgency} />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="button" variant="outline" onClick={onBack} className="rounded-2xl">
          Back
        </Button>
        <Button type="button" onClick={onSubmit} disabled={loading} className="rounded-2xl">
          {loading ? <Spinner className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
          Submit Request
        </Button>
        <Button type="button" variant="outline" onClick={onAgentFirst} disabled={loading} className="rounded-2xl">
          <Headphones className="h-4 w-4" />
          Talk to Agent First
        </Button>
      </div>
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
          <CheckCircle2 className="h-5 w-5" />
          <div className="text-sm font-semibold uppercase tracking-[0.22em]">Request saved</div>
        </div>
        {referenceNumber ? <div className="text-2xl font-semibold text-slate-950">{referenceNumber}</div> : null}
        <p className="text-sm leading-6 text-slate-700">{message}</p>
      </CardContent>
    </Card>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</div>
      <div className="mt-1 text-sm leading-6 text-slate-900">{value || 'Not provided'}</div>
    </div>
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
          Request checklist
        </Badge>
        <CardTitle className="text-xl text-slate-950">What dispatch needs</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-6 text-sm leading-6 text-slate-600">
        <div className="rounded-2xl bg-slate-50 px-4 py-3">
          Customer/dealership name, contact person, phone or email, vehicle description, and preferred timing.
        </div>
        <div className="rounded-2xl bg-slate-50 px-4 py-3">
          Use the service families if the customer knows the category, or type the request in plain language.
        </div>
        <div className="rounded-2xl bg-slate-50 px-4 py-3">
          The portal saves a reference number and tells the customer that dispatch/admin will review it.
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900">
          If the customer wants a human immediately, use Talk to Agent First.
        </div>
      </CardContent>
    </Card>
  );
}
