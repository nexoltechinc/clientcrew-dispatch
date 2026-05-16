import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  Smartphone,
  Clock3,
  ClipboardList,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { AuthPortalShell } from '@/components/auth/AuthPortalShell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import {
  clearRememberedLoginEmail,
  loadRememberedLoginEmail,
  saveRememberedLoginEmail,
} from '@/lib/login-preferences';

type NavigationState = {
  from?: string;
};

const TECH_DEFAULT_EMAIL = 'tech@dispatchiq.test';

const TECH_FEATURES = [
  {
    label: 'Today',
    title: 'Assigned jobs at a glance',
    description: 'Get straight to live work, current assignments, and the tasks you need to finish.',
    icon: ClipboardList,
  },
  {
    label: 'Field flow',
    title: 'Current and historical work',
    description: 'Move between your current job, history, and schedule without touching admin tools.',
    icon: Clock3,
  },
  {
    label: 'Mobile ready',
    title: 'Simple sign-in for the road',
    description: 'A clean, focused technician login that feels fast on every screen size.',
    icon: Smartphone,
  },
];

const TECH_TRUST_CHIPS = ['Fast mobile access', 'Encrypted sign-in', 'Dispatch synced'];

export default function TechnicianLoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const savedEmail = loadRememberedLoginEmail('technician');
  const [email, setEmail] = useState(savedEmail || TECH_DEFAULT_EMAIL);
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(Boolean(savedEmail));
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const from = (location.state as NavigationState | null)?.from;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await login(email, password, 'technician');

      if (rememberMe) {
        saveRememberedLoginEmail('technician', email);
      } else {
        clearRememberedLoginEmail('technician');
      }

      const destination = from && from.startsWith('/tech') ? from : '/tech/jobs';
      navigate(destination, { replace: true });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Sign in failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRememberChange = (checked: boolean) => {
    setRememberMe(checked);
    if (!checked) {
      clearRememberedLoginEmail('technician');
    }
  };

  return (
    <AuthPortalShell
      role="technician"
      portalBadge="Technician Portal"
      heroBadge="Field-ready access"
      heroTitle="Give technicians a focused, mobile-ready entry point."
      heroDescription="See assigned jobs, current work, history, and schedule in a login that feels streamlined, confident, and built for the field."
      heroIcon={LockKeyhole}
      heroFeatures={TECH_FEATURES}
      trustChips={TECH_TRUST_CHIPS}
      panelBackground="linear-gradient(160deg, #06190d 0%, #0b2e18 48%, #13401f 100%)"
      accentColor="#3B8D4F"
      accentSoft="rgba(59, 141, 79, 0.24)"
      cardBadge="Technician access"
      cardTitle="Technician Sign In"
      cardDescription="Sign in to access assigned jobs, current work, history, and your technician profile from a cleaner, role-specific portal."
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2.5">
          <Label htmlFor="tech-email" className="text-sm font-semibold text-slate-800">
            Email
          </Label>
          <p className="text-xs leading-5 text-slate-500">
            Use the email assigned to your technician account.
          </p>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              id="tech-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
              className="h-12 rounded-2xl border-slate-200/80 bg-white/90 pl-11 pr-4 text-slate-900 shadow-sm transition placeholder:text-slate-400 focus-visible:border-[#3B8D4F] focus-visible:ring-[#3B8D4F]/20"
            />
          </div>
        </div>

        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="tech-password" className="text-sm font-semibold text-slate-800">
              Password
            </Label>
            <Dialog>
              <DialogTrigger asChild>
                <button
                  type="button"
                  className="text-sm font-semibold text-[#3B8D4F] transition hover:text-[#2f7641]"
                >
                  Forgot password?
                </button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Technician password help</DialogTitle>
                  <DialogDescription>
                    Technician password resets are coordinated through the admin team.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 text-sm leading-6 text-slate-600">
                  <p>If you still have access, sign in and update your password from your profile settings.</p>
                  <p>If you are locked out, contact an admin so they can help you regain access.</p>
                </div>
                <DialogFooter className="sm:justify-between">
                  <Button type="button" variant="outline" asChild>
                    <Link to="/tech/signup">Create account</Link>
                  </Button>
                  <Button type="button" asChild className="bg-[#3B8D4F] hover:bg-[#2f7641]">
                    <Link to="/admin/login">Contact admin</Link>
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="relative">
            <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              id="tech-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              className="h-12 rounded-2xl border-slate-200/80 bg-white/90 pl-11 pr-12 text-slate-900 shadow-sm transition placeholder:text-slate-400 focus-visible:border-[#3B8D4F] focus-visible:ring-[#3B8D4F]/20"
            />
            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-700"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3">
          <Checkbox
            id="tech-remember"
            checked={rememberMe}
            onCheckedChange={(checked) => handleRememberChange(checked === true)}
          />
          <div className="space-y-0.5">
            <Label htmlFor="tech-remember" className="cursor-pointer text-sm font-medium text-slate-700">
              Remember this device
            </Label>
            <p className="text-xs text-slate-500">
              Keeps your email on this browser for quicker job-site sign-ins.
            </p>
          </div>
        </div>

        {errorMessage && (
          <Alert
            variant="destructive"
            className="rounded-2xl border-rose-200 bg-rose-50/90 text-rose-700"
          >
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}

        <Button
          type="submit"
          style={{
            backgroundColor: '#3B8D4F',
            color: '#ffffff',
            boxShadow: '0 18px 40px rgba(59, 141, 79, 0.28)',
          }}
          className="h-12 w-full rounded-2xl text-base font-semibold transition hover:-translate-y-0.5"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Spinner className="size-4" />
              Signing in...
            </>
          ) : (
            'Sign in as Technician'
          )}
        </Button>
      </form>

      <div className="mt-6 space-y-4">
        <Separator className="bg-slate-200/80" />

        <div className="grid gap-3 rounded-3xl border border-slate-200/80 bg-slate-50/90 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <p className="text-sm font-medium text-slate-900">New technician?</p>
            <p className="text-sm leading-6 text-slate-600">
              Request access through the signup flow and wait for admin approval.
            </p>
          </div>
          <Button
            variant="outline"
            asChild
            className="rounded-full border-slate-200 bg-white px-4 text-slate-900 shadow-sm"
          >
            <Link to="/tech/signup">Create account</Link>
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {TECH_TRUST_CHIPS.map((chip) => (
            <Badge
              key={chip}
              variant="outline"
              className="rounded-full border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-600"
            >
              {chip}
            </Badge>
          ))}
        </div>
      </div>
    </AuthPortalShell>
  );
}

