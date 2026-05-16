import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Filter,
  RefreshCw,
  Search,
  Sparkles,
  Wrench,
  CalendarCheck2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { CustomerPortalShell } from '@/components/customer/CustomerPortalShell';
import {
  CUSTOMER_SERVICE_FAMILIES,
  normalizeCustomerServiceSelection,
  type CustomerServiceFamily,
} from '@/lib/customer-service-matcher';
import { fetchCustomerServices, type CustomerServiceCatalogItem } from '@/lib/customer-api';
import { cn } from '@/lib/utils';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
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

export default function CustomerServices() {
  const [services, setServices] = useState<CustomerServiceCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFamily, setActiveFamily] = useState<string>('all');

  const loadServices = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const rows = await fetchCustomerServices();
      setServices(rows);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load the live catalog.');
      setServices([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadServices();
  }, []);

  const filteredServices = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    return services.filter((service) => {
      const family = getFamilyForService(service);
      const familyMatches = activeFamily === 'all' || family?.key === activeFamily;
      const searchMatches =
        !search
        || [service.code, service.name, service.category, service.description ?? '']
          .join(' ')
          .toLowerCase()
          .includes(search);
      return familyMatches && searchMatches;
    });
  }, [activeFamily, searchTerm, services]);

  const familySummaries = useMemo(() => {
    return CUSTOMER_SERVICE_FAMILIES.map((family) => {
      const rows = services.filter((service) => getFamilyForService(service)?.key === family.key);
      const prices = rows
        .map((service) => toNumber(service.default_price))
        .filter((value) => Number.isFinite(value));
      const lowest = prices.length > 0 ? Math.min(...prices) : null;

      return {
        family,
        count: rows.length,
        basePrice: lowest,
      };
    });
  }, [services]);

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
          <Sparkles className="h-4 w-4" />
          Ask for help
        </Link>
      </Button>
    </>
  );

  return (
    <CustomerPortalShell
      pageBadge="Services"
      pageTitle="Browse the live service catalog"
      pageDescription="View the active catalog by family, check base catalog pricing, and move into the request flow when you are ready."
      actions={heroActions}
      stats={[
        { label: 'Families', value: String(CUSTOMER_SERVICE_FAMILIES.length), detail: 'Service families understood by the portal.' },
        { label: 'Live items', value: String(services.length), detail: 'Active catalog rows returned by the backend.' },
        { label: 'Pricing', value: 'Base only', detail: 'The portal shows base catalog price only.' },
        { label: 'Routing', value: 'Human review', detail: 'No final quote or technician assignment here.' },
      ]}
      sidebar={<SidebarCard />}
    >
      <Card className="rounded-[28px] border-white/80 bg-white/95 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
        <CardHeader className="space-y-4 border-b border-slate-100">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 text-slate-600">
              Live catalog
            </Badge>
            <Badge variant="outline" className="rounded-full border-emerald-200 bg-emerald-50 text-emerald-700">
              Base catalog price only
            </Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search by service name, code, or category"
                className="h-12 rounded-2xl border-slate-200 bg-slate-50 pl-11"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => void loadServices()}
              className="h-12 rounded-2xl border-slate-200 bg-white"
              disabled={loading}
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 p-6">
          {loading ? (
            <LoadingState />
          ) : errorMessage ? (
            <ErrorState message={errorMessage} onRetry={() => void loadServices()} />
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <FilterChip active={activeFamily === 'all'} onClick={() => setActiveFamily('all')}>
                  All services
                </FilterChip>
                {familySummaries.map((item) => (
                  <FilterChip
                    key={item.family.key}
                    active={activeFamily === item.family.key}
                    onClick={() => setActiveFamily(item.family.key)}
                  >
                    {item.family.label}
                  </FilterChip>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {familySummaries.map((item) => (
                  <button
                    key={item.family.key}
                    type="button"
                    onClick={() => setActiveFamily(item.family.key)}
                    className={cn(
                      'rounded-[24px] border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md',
                      activeFamily === item.family.key
                        ? 'border-[color:var(--customer-primary)] bg-[rgba(47,142,146,0.08)]'
                        : 'border-slate-100 bg-slate-50/80',
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-slate-950">{item.family.label}</div>
                      <ArrowRight className="h-4 w-4 text-slate-400" />
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{item.family.description}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-medium text-slate-600">
                      <Badge variant="outline" className="rounded-full border-slate-200 bg-white text-slate-600">
                        {item.count} live item{item.count === 1 ? '' : 's'}
                      </Badge>
                      <Badge variant="outline" className="rounded-full border-slate-200 bg-white text-slate-600">
                        {item.basePrice !== null ? `From ${currencyFormatter.format(item.basePrice)}` : 'Awaiting live price'}
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold text-slate-950">
                      {activeFamily === 'all'
                        ? 'All active services'
                        : familySummaries.find((item) => item.family.key === activeFamily)?.family.label ?? 'Services'}
                    </h2>
                    <p className="text-sm text-slate-600">
                      Prices shown here are the base catalog price only. The final total, discounts, warranties, and completion time are not promised here.
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  {filteredServices.length === 0 ? (
                    <EmptyState />
                  ) : (
                    filteredServices.map((service) => {
                      const family = getFamilyForService(service);
                      const price = toNumber(service.default_price);
                      return (
                        <Card
                          key={service.id}
                          className="rounded-[24px] border-slate-100 bg-white/95 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                        >
                          <CardContent className="space-y-3 p-5">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h3 className="text-base font-semibold text-slate-950">{service.name}</h3>
                                  {service.approval_required ? (
                                    <Badge variant="outline" className="rounded-full border-amber-200 bg-amber-50 text-amber-700">
                                      Approval required
                                    </Badge>
                                  ) : null}
                                </div>
                                <p className="mt-1 text-sm leading-6 text-slate-600">{service.description ?? 'No description available.'}</p>
                              </div>
                              <div className="rounded-2xl bg-slate-950 px-3 py-2 text-right text-white">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">
                                  Base
                                </div>
                                <div className="text-sm font-semibold">
                                  {Number.isFinite(price) ? currencyFormatter.format(price) : 'TBD'}
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 text-slate-600">
                                {family?.label ?? service.category}
                              </Badge>
                              <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 text-slate-600">
                                Code {service.code}
                              </Badge>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </CustomerPortalShell>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-4 py-2 text-sm font-medium transition',
        active
          ? 'border-[color:var(--customer-primary)] bg-[rgba(47,142,146,0.1)] text-slate-950'
          : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100',
      )}
    >
      {children}
    </button>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-32 rounded-[24px]" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-40 rounded-[24px]" />
        ))}
      </div>
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <Card className="rounded-[24px] border-rose-200 bg-rose-50">
      <CardContent className="space-y-4 p-5 text-rose-900">
        <div className="text-sm font-semibold uppercase tracking-[0.22em]">Catalog unavailable</div>
        <p className="text-sm leading-6">{message}</p>
        <Button type="button" onClick={onRetry} className="rounded-2xl">
          <RefreshCw className="h-4 w-4" />
          Retry
        </Button>
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <Card className="rounded-[24px] border-slate-200 bg-slate-50">
      <CardContent className="space-y-3 p-5">
        <div className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">
          No matching services
        </div>
        <p className="text-sm leading-6 text-slate-600">
          Try a different keyword or clear the category filter.
        </p>
      </CardContent>
    </Card>
  );
}

function SidebarCard() {
  return (
    <Card className="rounded-[28px] border-white/80 bg-white/95 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
      <CardHeader className="border-b border-slate-100">
        <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 text-slate-600">
          Catalog rules
        </Badge>
        <CardTitle className="text-xl text-slate-950">Keep the promises safe</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-6 text-sm leading-6 text-slate-600">
        <div className="rounded-2xl bg-slate-50 px-4 py-3">
          Base catalog price only.
        </div>
        <div className="rounded-2xl bg-slate-50 px-4 py-3">
          No discounts, warranties, completion time, or final total unless the backend confirms it.
        </div>
        <div className="rounded-2xl bg-slate-50 px-4 py-3">
          Live catalog items are grouped by service family when possible.
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900">
          Use the request page to send a service inquiry once the customer is ready.
        </div>
      </CardContent>
    </Card>
  );
}
