import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { UserRole } from '@/types';

export type PortalFeature = {
  label: string;
  title: string;
  description: string;
  icon: LucideIcon;
};

type AuthPortalShellProps = {
  role: UserRole;
  portalBadge: string;
  heroBadge: string;
  heroTitle: string;
  heroDescription: string;
  heroIcon: LucideIcon;
  heroFeatures: PortalFeature[];
  trustChips: string[];
  panelBackground: string;
  accentColor: string;
  accentSoft: string;
  cardBadge: string;
  cardTitle: string;
  cardDescription: string;
  children: ReactNode;
};

export function AuthPortalShell({
  role,
  portalBadge,
  heroBadge,
  heroTitle,
  heroDescription,
  heroIcon: HeroIcon,
  heroFeatures,
  trustChips,
  panelBackground,
  accentColor,
  accentSoft,
  cardBadge,
  cardTitle,
  cardDescription,
  children,
}: AuthPortalShellProps) {
  const alternateRole = role === 'admin'
    ? { label: 'Technician', path: '/tech/login' }
    : { label: 'Admin', path: '/admin/login' };

  const activeRoleLabel = role === 'admin' ? 'Admin' : 'Technician';

  return (
    <div className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(47,142,146,0.14),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(59,141,79,0.08),_transparent_26%),linear-gradient(135deg,#eef5f6_0%,#f8fbff_46%,#edf3f8_100%)] px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
      <div className="relative mx-auto grid min-h-[calc(100vh-2rem)] max-w-7xl items-stretch gap-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
        <section
          className="relative hidden overflow-hidden rounded-[32px] border border-white/10 px-8 py-8 text-white shadow-[0_30px_120px_rgba(15,23,42,0.22)] lg:flex lg:flex-col"
          style={{ backgroundImage: panelBackground } as CSSProperties}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.14),transparent_24%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.08),transparent_28%)]" />
          <div
            className="absolute -left-20 top-10 h-72 w-72 rounded-full blur-3xl"
            style={{ backgroundColor: accentSoft }}
          />
          <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-white/6 blur-3xl" />

          <div className="relative flex h-full flex-col">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div
                  className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/12 shadow-lg shadow-black/10"
                  style={{ backgroundColor: accentSoft }}
                >
                  <HeroIcon className="h-6 w-6 text-white" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/60">
                    {portalBadge}
                  </p>
                </div>
              </div>
              <div className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/78">
                {activeRoleLabel} access
              </div>
            </div>

            <div className="mt-14 max-w-2xl pb-4">
              <Badge
                variant="outline"
                className="border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/80"
              >
                {heroBadge}
              </Badge>
              <h2 className="mt-5 text-4xl font-semibold tracking-tight text-white">
                {heroTitle}
              </h2>
              <p className="mt-4 max-w-xl text-base leading-7 text-white/74">
                {heroDescription}
              </p>
            </div>

            <div className="grid gap-3">
              {heroFeatures.map((feature) => {
                const FeatureIcon = feature.icon;

                return (
                  <div
                    key={`${feature.label}-${feature.title}`}
                    className="rounded-3xl border border-white/12 bg-white/10 p-4 backdrop-blur-sm transition-transform duration-300 hover:-translate-y-0.5"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/12 bg-white/10">
                        <FeatureIcon className="h-5 w-5 text-white" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/52">
                          {feature.label}
                        </p>
                        <p className="mt-1 text-lg font-semibold tracking-tight text-white">
                          {feature.title}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-white/72">
                          {feature.description}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {trustChips.map((chip) => (
                <Badge
                  key={chip}
                  variant="outline"
                  className="border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/78"
                >
                  {chip}
                </Badge>
              ))}
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center">
          <Card className="w-full max-w-[560px] gap-0 overflow-hidden rounded-[30px] border-white/70 bg-white/95 p-0 shadow-[0_30px_100px_rgba(15,23,42,0.18)] backdrop-blur">
            <CardHeader className="space-y-6 border-b border-slate-100 px-6 py-6 sm:px-8">
              <div className="flex items-center justify-between gap-4">
                <Badge
                  variant="outline"
                  className="rounded-full border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-600"
                >
                  {cardBadge}
                </Badge>
                <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1 shadow-sm">
                  {role === 'admin' ? (
                    <span
                      className="rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold shadow-sm"
                      style={{ color: '#0f172a' }}
                    >
                      Admin
                    </span>
                  ) : (
                    <Link
                      to={alternateRole.path}
                      className="rounded-full px-3.5 py-1.5 text-xs font-semibold transition hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50"
                      style={{ color: '#64748b', textDecoration: 'none' }}
                    >
                      {alternateRole.label}
                    </Link>
                  )}
                  {role === 'technician' ? (
                    <span
                      className="rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold shadow-sm"
                      style={{ color: '#0f172a' }}
                    >
                      Technician
                    </span>
                  ) : (
                    <Link
                      to={alternateRole.path}
                      className="rounded-full px-3.5 py-1.5 text-xs font-semibold transition hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50"
                      style={{ color: '#64748b', textDecoration: 'none' }}
                    >
                      {alternateRole.label}
                    </Link>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <CardTitle className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-[2.1rem]">
                  {cardTitle}
                </CardTitle>
                <CardDescription className="max-w-2xl text-[15px] leading-7 text-slate-600">
                  {cardDescription}
                </CardDescription>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
                <span
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5"
                  style={{ color: accentColor }}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: accentColor }} />
                  Secure role-based access
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: accentColor }} />
                  SSO-ready
                </span>
              </div>
            </CardHeader>
            <CardContent className="px-6 py-6 sm:px-8">
              {children}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
