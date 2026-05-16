import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BadgeInfo,
  CalendarCheck2,
  LifeBuoy,
  Sparkles,
  Wrench,
  MessageCircleMore,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CustomerPortalShell } from '@/components/customer/CustomerPortalShell';
import { CUSTOMER_SERVICE_FAMILIES } from '@/lib/customer-service-matcher';

const HERO_ACTIONS = (
  <>
    <Button asChild className="rounded-2xl">
      <Link to="/customer/request-service">
        <CalendarCheck2 className="h-4 w-4" />
        Request service
      </Link>
    </Button>
    <Button asChild variant="outline" className="rounded-2xl">
      <Link to="/customer/services">
        <Wrench className="h-4 w-4" />
        View services
      </Link>
    </Button>
    <Button asChild variant="outline" className="rounded-2xl">
      <Link to="/customer/status">
        <BadgeInfo className="h-4 w-4" />
        Check status
      </Link>
    </Button>
  </>
);

const HERO_STATS = [
  { label: 'No login', value: 'Public access', detail: 'Dealership and customer users can start right away.' },
  { label: 'Reference', value: 'Saved on submit', detail: 'Every request gets a customer-safe reference number.' },
  { label: 'Catalog', value: 'Live base prices', detail: 'Service browsing uses the active catalog when available.' },
  { label: 'Support', value: 'Human review', detail: 'Dispatch/admin handles agent routing and follow-up.' },
];

const FEATURE_CARDS = [
  {
    title: 'Browse the catalog',
    description: 'See active services and base catalog pricing without exposing internal admin details.',
    icon: Wrench,
    to: '/customer/services',
  },
  {
    title: 'Request service',
    description: 'Capture service intent, vehicle details, and scheduling preferences in a clean intake flow.',
    icon: CalendarCheck2,
    to: '/customer/request-service',
  },
  {
    title: 'Check job status',
    description: 'Use a job code first, then fall back to account details if the code is unavailable.',
    icon: BadgeInfo,
    to: '/customer/status',
  },
  {
    title: 'Invoice help',
    description: 'Look up invoice statuses and route disputes, missing invoices, or payment issues to a human.',
    icon: LifeBuoy,
    to: '/customer/support',
  },
];

export default function CustomerHome() {
  return (
    <CustomerPortalShell
      pageBadge="Customer portal"
      pageTitle="Book service, check status, or reach dispatch without signing in"
      pageDescription="DispatchIQ gives dealership and customer users a clean front door for service browsing, intake, job tracking, and invoice help."
      actions={HERO_ACTIONS}
      stats={HERO_STATS}
      sidebar={<SidebarCard />}
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <Card className="rounded-[28px] border-white/80 bg-white/95 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
          <CardHeader className="border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 text-slate-600">
                What you can do
              </Badge>
              <Badge className="rounded-full bg-emerald-600 text-white hover:bg-emerald-600">
                Customer-safe flow
              </Badge>
            </div>
            <CardTitle className="text-2xl text-slate-950">A simpler way to start work</CardTitle>
            <CardDescription className="text-slate-600">
              No login required. The portal asks for only the details dispatch needs to review the request.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 p-6 sm:grid-cols-2">
            {FEATURE_CARDS.map((feature) => {
              const Icon = feature.icon;
              return (
                <Link
                  key={feature.title}
                  to={feature.to}
                  className="group rounded-[24px] border border-slate-100 bg-slate-50/80 p-5 transition hover:-translate-y-0.5 hover:border-slate-200 hover:bg-white"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm transition group-hover:scale-105">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-semibold text-slate-950">{feature.title}</h3>
                        <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-700" />
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{feature.description}</p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </CardContent>
        </Card>

        <Card className="rounded-[28px] border-white/80 bg-slate-950 text-white shadow-[0_18px_60px_rgba(15,23,42,0.12)]">
          <CardHeader>
            <Badge variant="outline" className="w-fit rounded-full border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/80">
              Need help now?
            </Badge>
            <CardTitle className="text-2xl text-white">Start with the fastest path</CardTitle>
            <CardDescription className="text-white/72">
              The chat widget and the public pages share the same customer session, so you can switch between them without losing context.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-[24px] border border-white/10 bg-white/8 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/12">
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">Quick support routing</div>
                  <div className="text-sm text-white/70">Service, status, invoice, and human handoff all use customer-safe copy.</div>
                </div>
              </div>
            </div>
            <Button asChild className="w-full rounded-2xl bg-white text-slate-950 hover:bg-white/90">
              <Link to="/customer/request-service">
                <MessageCircleMore className="h-4 w-4" />
                Open request flow
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full rounded-2xl border-white/15 bg-transparent text-white hover:bg-white/10">
              <Link to="/customer/support">
                <LifeBuoy className="h-4 w-4" />
                Invoice or agent help
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-[28px] border-white/80 bg-white/95 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
        <CardHeader className="border-b border-slate-100">
          <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 text-slate-600">
            Service families
          </Badge>
          <CardTitle className="text-2xl text-slate-950">Popular categories at a glance</CardTitle>
          <CardDescription className="text-slate-600">
            These are the service families the portal understands. Live prices appear on the catalog screen when the backend is available.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 p-6 sm:grid-cols-2 lg:grid-cols-3">
          {CUSTOMER_SERVICE_FAMILIES.map((family) => (
            <div key={family.key} className="rounded-[22px] border border-slate-100 bg-slate-50/80 p-4">
              <div className="text-sm font-semibold text-slate-950">{family.label}</div>
              <p className="mt-2 text-sm leading-6 text-slate-600">{family.description}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </CustomerPortalShell>
  );
}

function SidebarCard() {
  return (
    <Card className="rounded-[28px] border-white/80 bg-white/95 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
      <CardHeader className="border-b border-slate-100">
        <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 text-slate-600">
          How it works
        </Badge>
        <CardTitle className="text-xl text-slate-950">Everything stays customer-safe</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-6 text-sm leading-6 text-slate-600">
        <div className="rounded-2xl bg-slate-50 px-4 py-3">
          <div className="font-semibold text-slate-900">1. Choose a path</div>
          <div>Browse services, request help, check status, or ask about invoices.</div>
        </div>
        <div className="rounded-2xl bg-slate-50 px-4 py-3">
          <div className="font-semibold text-slate-900">2. Dispatch reviews it</div>
          <div>The backend saves a reference number and queues the request for review.</div>
        </div>
        <div className="rounded-2xl bg-slate-50 px-4 py-3">
          <div className="font-semibold text-slate-900">3. Human follow-up</div>
          <div>Agent handoff routes disputes and exceptions to dispatch/admin.</div>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900">
          <div className="font-semibold">No technician assignment from customers</div>
          <div>Dispatch controls scheduling and assignment; customers only submit the request.</div>
        </div>
      </CardContent>
    </Card>
  );
}
