import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  Route,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  requestForgotPasswordOtp,
  resetPasswordWithOtp,
  verifyForgotPasswordOtp,
} from '@/lib/backend-api';
import {
  clearRememberedLoginEmail,
  loadRememberedLoginEmail,
  saveRememberedLoginEmail,
} from '@/lib/login-preferences';
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

type NavigationState = {
  from?: string;
};

const ADMIN_DEFAULT_EMAIL = 'nexoltechsolutionsinc@gmail.com';

const ADMIN_FEATURES = [
  {
    label: 'Operations',
    title: 'Dispatch command center',
    description: 'See jobs, technicians, approvals, and platform changes from one secure workspace.',
    icon: Route,
  },
  {
    label: 'Security',
    title: 'Role-based controls',
    description: 'Keep admin tools separate from field access with a polished, enterprise-style entry point.',
    icon: ShieldCheck,
  },
  {
    label: 'Momentum',
    title: 'Faster approvals',
    description: 'Move urgent work forward quickly with a form that feels clean, confident, and modern.',
    icon: Sparkles,
  },
];

const ADMIN_TRUST_CHIPS = ['256-bit encryption', 'Audit-ready', 'SSO-ready'];

export default function AdminLoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const savedEmail = loadRememberedLoginEmail('admin');
  const [email, setEmail] = useState(savedEmail || ADMIN_DEFAULT_EMAIL);
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(Boolean(savedEmail));
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);
  const [forgotStep, setForgotStep] = useState<'request' | 'verify' | 'reset'>('request');
  const [forgotEmail, setForgotEmail] = useState(savedEmail || ADMIN_DEFAULT_EMAIL);
  const [otp, setOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [forgotMessage, setForgotMessage] = useState<string | null>(null);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [isForgotSubmitting, setIsForgotSubmitting] = useState(false);

  const from = (location.state as NavigationState | null)?.from;

  const resetForgotState = () => {
    setForgotStep('request');
    setForgotEmail(email || savedEmail || ADMIN_DEFAULT_EMAIL);
    setOtp('');
    setResetToken('');
    setNewPassword('');
    setConfirmNewPassword('');
    setForgotMessage(null);
    setForgotError(null);
    setIsForgotSubmitting(false);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await login(email, password, 'admin');

      if (rememberMe) {
        saveRememberedLoginEmail('admin', email);
      } else {
        clearRememberedLoginEmail('admin');
      }

      const destination = from && from.startsWith('/admin') ? from : '/admin';
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
      clearRememberedLoginEmail('admin');
    }
  };

  const handleRequestOtp = async () => {
    setForgotError(null);
    setForgotMessage(null);
    setIsForgotSubmitting(true);
    try {
      const response = await requestForgotPasswordOtp({ email: forgotEmail });
      setForgotMessage(response.message);
      setForgotStep('verify');
    } catch (error) {
      setForgotError(error instanceof Error ? error.message : 'Unable to send reset code.');
    } finally {
      setIsForgotSubmitting(false);
    }
  };

  const handleVerifyOtp = async () => {
    setForgotError(null);
    setForgotMessage(null);
    setIsForgotSubmitting(true);
    try {
      const response = await verifyForgotPasswordOtp({ email: forgotEmail, otp });
      setResetToken(response.reset_token);
      setForgotMessage('OTP verified. You can now set a new password.');
      setForgotStep('reset');
    } catch (error) {
      setForgotError(error instanceof Error ? error.message : 'OTP verification failed.');
    } finally {
      setIsForgotSubmitting(false);
    }
  };

  const handleResetPassword = async () => {
    setForgotError(null);
    setForgotMessage(null);
    if (!newPassword || !confirmNewPassword) {
      setForgotError('Enter and confirm the new password.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setForgotError('New password and confirmation do not match.');
      return;
    }

    setIsForgotSubmitting(true);
    try {
      await resetPasswordWithOtp({
        reset_token: resetToken,
        new_password: newPassword,
      });
      setForgotMessage('Password reset successfully. Sign in with the new password.');
      setPassword('');
      setIsForgotPasswordOpen(false);
      resetForgotState();
    } catch (error) {
      setForgotError(error instanceof Error ? error.message : 'Unable to reset password.');
    } finally {
      setIsForgotSubmitting(false);
    }
  };

  return (
    <AuthPortalShell
      role="admin"
      portalBadge="Admin Portal"
      heroBadge="Dispatch command center"
      heroTitle="Run the operation from one polished portal."
      heroDescription="Manage dispatch activity, technician performance, approvals, and platform settings in a login that feels premium, secure, and easy to scan."
      heroIcon={ShieldCheck}
      heroFeatures={ADMIN_FEATURES}
      trustChips={ADMIN_TRUST_CHIPS}
      panelBackground="linear-gradient(160deg, #07152d 0%, #0a2147 48%, #12335d 100%)"
      accentColor="#2F8E92"
      accentSoft="rgba(47, 142, 146, 0.24)"
      cardBadge="Admin access"
      cardTitle="Admin Sign In"
      cardDescription="Sign in to oversee dispatch operations, technician activity, approvals, and enterprise settings from a cleaner, more confident entry point."
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2.5">
          <Label htmlFor="admin-email" className="text-sm font-semibold text-slate-800">
            Email
          </Label>
          <p className="text-xs leading-5 text-slate-500">
            Use the admin email tied to your dispatch workspace.
          </p>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              id="admin-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
              className="h-12 rounded-2xl border-slate-200/80 bg-white/90 pl-11 pr-4 text-slate-900 shadow-sm transition placeholder:text-slate-400 focus-visible:border-[#2F8E92] focus-visible:ring-[#2F8E92]/20"
            />
          </div>
        </div>

        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="admin-password" className="text-sm font-semibold text-slate-800">
              Password
            </Label>
            <Dialog
              open={isForgotPasswordOpen}
              onOpenChange={(open) => {
                setIsForgotPasswordOpen(open);
                if (open) {
                  resetForgotState();
                }
              }}
            >
              <DialogTrigger asChild>
                <button
                  type="button"
                  className="text-sm font-semibold text-[#2F8E92] transition hover:text-[#236f72]"
                >
                  Forgot password?
                </button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Reset admin password</DialogTitle>
                  <DialogDescription>
                    Verify by OTP, then set a new admin password.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="forgot-admin-email">Admin Email</Label>
                    <Input
                      id="forgot-admin-email"
                      type="email"
                      value={forgotEmail}
                      onChange={(event) => setForgotEmail(event.target.value)}
                      disabled={forgotStep !== 'request'}
                      autoComplete="email"
                    />
                  </div>

                  {forgotStep !== 'request' && (
                    <div className="space-y-2">
                      <Label htmlFor="forgot-admin-otp">OTP Code</Label>
                      <Input
                        id="forgot-admin-otp"
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="6-digit OTP"
                        value={otp}
                        onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                      />
                    </div>
                  )}

                  {forgotStep === 'reset' && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="forgot-admin-new-password">New Password</Label>
                        <Input
                          id="forgot-admin-new-password"
                          type="password"
                          value={newPassword}
                          onChange={(event) => setNewPassword(event.target.value)}
                          autoComplete="new-password"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="forgot-admin-confirm-password">Confirm Password</Label>
                        <Input
                          id="forgot-admin-confirm-password"
                          type="password"
                          value={confirmNewPassword}
                          onChange={(event) => setConfirmNewPassword(event.target.value)}
                          autoComplete="new-password"
                        />
                      </div>
                    </div>
                  )}

                  {forgotMessage && (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                      {forgotMessage}
                    </div>
                  )}

                  {forgotError && (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                      {forgotError}
                    </div>
                  )}
                </div>
                <DialogFooter className="sm:justify-between">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsForgotPasswordOpen(false);
                      resetForgotState();
                    }}
                  >
                    Close
                  </Button>
                  {forgotStep === 'request' && (
                    <Button type="button" onClick={handleRequestOtp} disabled={isForgotSubmitting}>
                      {isForgotSubmitting ? 'Sending...' : 'Send OTP'}
                    </Button>
                  )}
                  {forgotStep === 'verify' && (
                    <Button type="button" onClick={handleVerifyOtp} disabled={isForgotSubmitting}>
                      {isForgotSubmitting ? 'Verifying...' : 'Verify OTP'}
                    </Button>
                  )}
                  {forgotStep === 'reset' && (
                    <Button type="button" onClick={handleResetPassword} disabled={isForgotSubmitting}>
                      {isForgotSubmitting ? 'Updating...' : 'Reset Password'}
                    </Button>
                  )}
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="relative">
            <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              id="admin-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              className="h-12 rounded-2xl border-slate-200/80 bg-white/90 pl-11 pr-12 text-slate-900 shadow-sm transition placeholder:text-slate-400 focus-visible:border-[#2F8E92] focus-visible:ring-[#2F8E92]/20"
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
            id="admin-remember"
            checked={rememberMe}
            onCheckedChange={(checked) => handleRememberChange(checked === true)}
          />
          <div className="space-y-0.5">
            <Label htmlFor="admin-remember" className="cursor-pointer text-sm font-medium text-slate-700">
              Remember this device
            </Label>
            <p className="text-xs text-slate-500">
              Keeps your email on this browser for faster return sign-ins.
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
            backgroundColor: '#2F8E92',
            color: '#ffffff',
            boxShadow: '0 18px 40px rgba(47, 142, 146, 0.28)',
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
            'Sign in as Admin'
          )}
        </Button>
      </form>

      <div className="mt-6 space-y-4">
        <Separator className="bg-slate-200/80" />

        <div className="grid gap-3 rounded-3xl border border-slate-200/80 bg-slate-50/90 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <p className="text-sm font-medium text-slate-900">Need technician access?</p>
            <p className="text-sm leading-6 text-slate-600">
              Jump to the field portal if you are signing in from the job site.
            </p>
          </div>
          <Button
            variant="outline"
            asChild
            className="rounded-full border-slate-200 bg-white px-4 text-slate-900 shadow-sm"
          >
            <Link to="/tech/login">Go to technician login</Link>
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {ADMIN_TRUST_CHIPS.map((chip) => (
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
