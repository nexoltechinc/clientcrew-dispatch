import { type CSSProperties, type ReactNode, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  BadgeInfo,
  CalendarCheck2,
  FileText,
  Headphones,
  LayoutGrid,
  LifeBuoy,
  MapPinned,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { fetchCustomerBranding, type CustomerBranding } from '@/lib/customer-api';
import { cn } from '@/lib/utils';
import { CustomerChatWidget } from '@/components/customer/CustomerChatWidget';
import { CustomerPortalProvider, useCustomerPortal } from '@/components/customer/customer-portal-context';

const FALLBACK_BRANDING: CustomerBranding = {
  logo_url: null,
  name: 'DispatchIQ',
  street_address: '',
  city: '',
  state: '',
  zip_code: '',
  phone: '',
  email: '',
  website: '',
  primary_color: '#2F8E92',
};

const NAV_ITEMS = [
  { label: 'Home', path: '/customer', icon: LayoutGrid },
  { label: 'Services', path: '/customer/services', icon: Wrench },
  { label: 'Request', path: '/customer/request-service', icon: CalendarCheck2 },
  { label: 'Status', path: '/customer/status', icon: BadgeInfo },
  { label: 'Support', path: '/customer/support', icon: LifeBuoy },
];

type CustomerPortalShellProps = {
  pageBadge: string;
  pageTitle: string;
  pageDescription: string;
  actions?: ReactNode;
  stats?: Array<{
    label: string;
    value: string;
    detail?: string;
  }>;
  sidebar?: ReactNode;
  children: ReactNode;
};

function CustomerBrandMark() {
  const { branding, isBrandingLoaded } = useCustomerPortal();
  const hasLogo = Boolean(branding.logo_url?.trim());

  return (
    <div className="flex items-center gap-3">
      <div
        className="flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-lg shadow-slate-900/10"
        style={{ backgroundColor: branding.primary_color }}
      >
        {hasLogo ? (
          <img src={branding.logo_url ?? undefined} alt={branding.name} className="h-7 w-7 rounded-lg object-contain" />
        ) : (
          <Sparkles className="h-5 w-5" />
        )}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="truncate text-base font-semibold tracking-tight text-slate-900">
            {branding.name || 'DispatchIQ'}
          </h1>
          {!isBrandingLoaded ? (
            <Spinner className="h-3.5 w-3.5 text-slate-400" />
          ) : null}
        </div>
        <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
          Customer portal
        </p>
      </div>
    </div>
  );
}

function BrandContactChips() {
  const { branding } = useCustomerPortal();
  const contactPieces = [
    branding.phone ? { label: branding.phone, icon: Headphones } : null,
    branding.email ? { label: branding.email, icon: FileText } : null,
    branding.website ? { label: branding.website.replace(/^https?:\/\//i, ''), icon: MapPinned } : null,
  ].filter(Boolean) as Array<{ label: string; icon: typeof Headphones }>;

  if (contactPieces.length === 0) {
    return null;
  }

  return (
    <div className="hidden flex-wrap items-center gap-2 lg:flex">
      {contactPieces.map((piece) => {
        const Icon = piece.icon;
        return (
          <Badge
            key={piece.label}
            variant="outline"
            className="rounded-full border-slate-200 bg-white/80 px-3 py-1 text-[11px] font-medium text-slate-600 shadow-sm"
          >
            <Icon className="mr-1.5 h-3.5 w-3.5" />
            {piece.label}
          </Badge>
        );
      })}
    </div>
  );
}

function PortalHeader() {
  const location = useLocation();
  const { branding, lastReferenceNumber } = useCustomerPortal();

  return (
    <header className="sticky top-0 z-20 -mx-4 mb-6 border-b border-white/60 bg-white/80 px-4 py-4 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <CustomerBrandMark />
          <div className="flex items-center gap-2">
            {lastReferenceNumber ? (
              <Badge
                variant="outline"
                className="rounded-full border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700"
              >
                Ref {lastReferenceNumber}
              </Badge>
            ) : null}
            <Badge
              variant="outline"
              className="rounded-full border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-600"
            >
              No login required
            </Badge>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 overflow-x-auto pb-0.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);

            return (
              <Button
                key={item.path}
                variant={active ? 'default' : 'outline'}
                size="sm"
                asChild
                className={cn(
                  'rounded-full border px-4 py-2 text-xs font-semibold shadow-sm',
                  !active && 'bg-white/80 text-slate-600 hover:bg-slate-50',
                )}
                style={
                  active
                    ? ({ backgroundColor: branding.primary_color, color: '#fff' } as CSSProperties)
                    : undefined
                }
              >
                <Link to={item.path} className="inline-flex items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </Link>
              </Button>
            );
          })}
          <BrandContactChips />
          <div className="ml-auto hidden items-center gap-2 lg:flex">
            <Button asChild size="sm" variant="outline" className="rounded-full border-slate-200 bg-white/80">
              <Link to="/customer/request-service">Book service</Link>
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}

export function CustomerPortalShell({
  pageBadge,
  pageTitle,
  pageDescription,
  actions,
  stats,
  sidebar,
  children,
}: CustomerPortalShellProps) {
  const [branding, setBranding] = useState<CustomerBranding>(FALLBACK_BRANDING);
  const [isBrandingLoaded, setIsBrandingLoaded] = useState(false);
  const [brandingError, setBrandingError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadBranding = async () => {
      try {
        const response = await fetchCustomerBranding();
        if (!active) {
          return;
        }
        setBranding({
          ...FALLBACK_BRANDING,
          ...response,
          primary_color: response.primary_color || FALLBACK_BRANDING.primary_color,
        });
        setBrandingError(null);
      } catch (error) {
        if (!active) {
          return;
        }
        setBranding(FALLBACK_BRANDING);
        setBrandingError(error instanceof Error ? error.message : 'Unable to load branding');
      } finally {
        if (active) {
          setIsBrandingLoaded(true);
        }
      }
    };

    void loadBranding();

    return () => {
      active = false;
    };
  }, []);

  return (
    <CustomerPortalProvider
      branding={branding}
      brandingError={brandingError}
      isBrandingLoaded={isBrandingLoaded}
    >
      <div
        className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(47,142,146,0.14),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(15,23,42,0.08),_transparent_24%),linear-gradient(180deg,#f7fafb_0%,#f5f8fb_46%,#eef3f7_100%)]"
        style={
          {
            '--customer-primary': branding.primary_color,
          } as CSSProperties
        }
      >
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
          <PortalHeader />

          {brandingError ? (
            <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Live branding could not be loaded. The portal is using a safe default theme.
            </div>
          ) : null}

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.18fr)_minmax(300px,0.82fr)]">
            <div className="space-y-6">
              <Card className="overflow-hidden rounded-[30px] border-white/80 bg-white/95 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
                <CardHeader className="border-b border-slate-100 bg-[linear-gradient(145deg,rgba(47,142,146,0.08),rgba(255,255,255,0.96))] px-6 py-6 sm:px-8">
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge
                      variant="outline"
                      className="rounded-full border-slate-200 bg-white/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-600 shadow-sm"
                    >
                      {pageBadge}
                    </Badge>
                    <Badge
                      variant="outline"
                      className="rounded-full border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-700"
                    >
                      Dispatch team ready
                    </Badge>
                  </div>
                  <CardTitle className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight text-slate-950 sm:text-[2.35rem]">
                    {pageTitle}
                  </CardTitle>
                  <CardDescription className="mt-3 max-w-3xl text-[15px] leading-7 text-slate-600">
                    {pageDescription}
                  </CardDescription>
                  {actions ? <div className="mt-5 flex flex-wrap gap-3">{actions}</div> : null}
                  {stats && stats.length > 0 ? (
                    <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {stats.map((stat) => (
                        <div
                          key={stat.label}
                          className="rounded-2xl border border-slate-100 bg-white/90 px-4 py-4 shadow-sm"
                        >
                          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                            {stat.label}
                          </div>
                          <div className="mt-2 text-xl font-semibold text-slate-900">{stat.value}</div>
                          {stat.detail ? (
                            <div className="mt-1 text-sm leading-6 text-slate-600">{stat.detail}</div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </CardHeader>
              </Card>

              {children}
            </div>

            {sidebar ? (
              <aside className="space-y-6">
                {sidebar}
              </aside>
            ) : null}
          </div>
        </div>
        <CustomerChatWidget />
      </div>
    </CustomerPortalProvider>
  );
}
