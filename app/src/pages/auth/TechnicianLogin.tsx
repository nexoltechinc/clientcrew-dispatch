import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LockKeyhole, Mail, Wrench } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
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

export default function TechnicianLoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('tech@mikechen.com');
  const [password, setPassword] = useState('tech123');
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
      const destination = from && from.startsWith('/tech') ? from : '/tech/jobs';
      navigate(destination, { replace: true });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Sign in failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(59,141,79,0.16),_transparent_28%),linear-gradient(135deg,#eff8f1_0%,#f8fbff_52%,#edf6f0_100%)] p-4 sm:p-6 flex items-center justify-center">
      <Card className="w-full max-w-[480px] overflow-hidden border-white/70 bg-white/95 shadow-[0_24px_80px_rgba(15,23,42,0.14)] backdrop-blur">
        <CardHeader className="space-y-4 border-b border-slate-100 bg-[linear-gradient(180deg,rgba(12,52,28,0.98)_0%,rgba(21,88,45,0.96)_100%)] px-6 py-7 text-white sm:px-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4caf63] to-[#3b8d4f] shadow-lg shadow-emerald-950/25">
              <Wrench className="h-5 w-5 text-white" />
            </div>
            <div className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-100">
              Technician Portal
            </div>
          </div>
          <div className="space-y-2">
            <CardTitle className="text-2xl font-semibold tracking-tight text-white">Technician Sign In</CardTitle>
            <CardDescription className="max-w-sm text-sm leading-6 text-emerald-100/85">
              Sign in to access assigned jobs, current work, history, schedule, and your technician profile.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="px-6 py-6 sm:px-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="tech-email" className="text-sm font-semibold text-slate-800">Email</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="tech-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                  className="h-11 border-slate-200 bg-slate-50 pl-10 text-slate-900 placeholder:text-slate-400 focus-visible:border-[#3b8d4f] focus-visible:ring-[#3b8d4f]"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="tech-password" className="text-sm font-semibold text-slate-800">Password</Label>
                <Dialog>
                  <DialogTrigger asChild>
                    <button
                      type="button"
                      className="text-sm font-medium text-[#3b8d4f] transition hover:text-[#2f7641] hover:underline"
                    >
                      Forgot password?
                    </button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Forgot technician password</DialogTitle>
                      <DialogDescription>
                        Technician password reset is handled through the admin team right now.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 text-sm text-muted-foreground">
                      <p>If you still have access, sign in and update your password from your profile settings.</p>
                      <p>If you are locked out, contact an admin so they can help you regain access.</p>
                    </div>
                    <DialogFooter className="sm:justify-between">
                      <Button type="button" variant="outline" asChild>
                        <Link to="/tech/signup">Create account</Link>
                      </Button>
                      <Button type="button" asChild className="bg-[#3b8d4f] hover:bg-[#2f7641]">
                        <Link to="/admin/login">Contact admin</Link>
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="tech-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                  className="h-11 border-slate-200 bg-slate-50 pl-10 pr-11 text-slate-900 placeholder:text-slate-400 focus-visible:border-[#3b8d4f] focus-visible:ring-[#3b8d4f]"
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
              className="h-11 w-full rounded-xl bg-[#3b8d4f] text-sm font-semibold shadow-sm transition hover:bg-[#2f7641]"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Signing in...' : 'Sign in as Technician'}
            </Button>

            <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
              <p className="text-sm text-slate-600 text-center">
                New technician? <Link to="/tech/signup" className="font-medium text-[#3b8d4f] hover:underline">Create account</Link>
              </p>
              <p className="text-sm text-slate-600 text-center">
                Admin account? <Link to="/admin/login" className="font-medium text-[#2F8E92] hover:underline">Go to admin login</Link>
              </p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
