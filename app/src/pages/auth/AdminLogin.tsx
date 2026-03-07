import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LockKeyhole, Mail, Shield } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  requestForgotPasswordOtp,
  resetPasswordWithOtp,
  verifyForgotPasswordOtp,
} from '@/lib/backend-api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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

type NavigationState = {
  from?: string;
};

export default function AdminLoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('admin@sm2dispatch.com');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);
  const [forgotStep, setForgotStep] = useState<'request' | 'verify' | 'reset'>('request');
  const [forgotEmail, setForgotEmail] = useState('admin@sm2dispatch.com');
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
    setForgotEmail(email || 'admin@sm2dispatch.com');
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
      const destination = from && from.startsWith('/admin') ? from : '/admin';
      navigate(destination, { replace: true });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Sign in failed.');
    } finally {
      setIsSubmitting(false);
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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(47,142,146,0.18),_transparent_28%),linear-gradient(135deg,#eff7f8_0%,#f8fbff_52%,#edf3fb_100%)] p-4 sm:p-6 flex items-center justify-center">
      <Card className="w-full max-w-[480px] overflow-hidden border-white/70 bg-white/95 shadow-[0_24px_80px_rgba(15,23,42,0.14)] backdrop-blur">
        <CardHeader className="space-y-4 border-b border-slate-100 bg-[linear-gradient(180deg,rgba(4,16,43,0.98)_0%,rgba(10,34,71,0.98)_100%)] px-6 py-7 text-white sm:px-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#3aa7ac] to-[#2F8E92] shadow-lg shadow-cyan-950/30">
              <Shield className="h-5 w-5 text-white" />
            </div>
            <div className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-100">
              Admin Portal
            </div>
          </div>
          <div className="space-y-2">
            <CardTitle className="text-2xl font-semibold tracking-tight text-white">Admin Sign In</CardTitle>
            <CardDescription className="max-w-sm text-sm leading-6 text-slate-300">
              Sign in to manage dispatch operations, technician activity, jobs, approvals, and platform settings.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="px-6 py-6 sm:px-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="admin-email" className="text-sm font-semibold text-slate-800">Email</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="admin-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                  className="h-11 border-slate-200 bg-slate-50 pl-10 text-slate-900 placeholder:text-slate-400 focus-visible:border-[#2F8E92] focus-visible:ring-[#2F8E92]"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="admin-password" className="text-sm font-semibold text-slate-800">Password</Label>
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
                      className="text-sm font-medium text-[#2F8E92] transition hover:text-[#256f73] hover:underline"
                    >
                      Forgot password?
                    </button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Forgot admin password</DialogTitle>
                      <DialogDescription>
                        Reset the admin password by email OTP.
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
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                          {forgotMessage}
                        </div>
                      )}

                      {forgotError && (
                        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
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
                <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="admin-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                  className="h-11 border-slate-200 bg-slate-50 pl-10 pr-11 text-slate-900 placeholder:text-slate-400 focus-visible:border-[#2F8E92] focus-visible:ring-[#2F8E92]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-600"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {errorMessage && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {errorMessage}
              </div>
            )}

            <Button
              type="submit"
              className="h-11 w-full rounded-xl bg-[#2F8E92] text-sm font-semibold shadow-sm transition hover:bg-[#27797d]"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Signing in...' : 'Sign in as Admin'}
            </Button>

            <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
              <p className="text-sm text-slate-600 text-center">
                Technician account? <Link to="/tech/login" className="font-medium text-[#2F8E92] hover:underline">Go to technician login</Link>
              </p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
