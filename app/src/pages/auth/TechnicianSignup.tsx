import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function TechnicianSignupPage() {
  const { requestTechnicianSignup } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      await requestTechnicianSignup({ name, email, phone, password });
      setSuccessMessage('Signup request submitted. Wait for admin approval before signing in.');
      setName('');
      setEmail('');
      setPhone('');
      setPassword('');
      setConfirmPassword('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to submit signup request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#eefaf1] via-white to-[#e8f6ec] p-4 flex items-center justify-center">
      <Card className="w-full max-w-md border-[#cfe4d5] shadow-lg">
        <CardHeader className="space-y-3">
          <div className="w-11 h-11 rounded-xl bg-[#3b8d4f] flex items-center justify-center">
            <UserPlus className="w-5 h-5 text-white" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-2xl">Technician Sign Up</CardTitle>
            <CardDescription>Submit a signup request. Your account is created only after admin approval.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="signup-name">Full Name</Label>
              <Input
                id="signup-name"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="signup-email">Email</Label>
              <Input
                id="signup-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="signup-phone">Phone (optional)</Label>
              <Input
                id="signup-phone"
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                autoComplete="tel"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="signup-password">Password</Label>
              <Input
                id="signup-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="signup-confirm-password">Confirm Password</Label>
              <Input
                id="signup-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                required
              />
            </div>

            {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}
            {successMessage && <p className="text-sm text-emerald-700">{successMessage}</p>}

            <Button type="submit" className="w-full bg-[#3b8d4f] hover:bg-[#2f7641]" disabled={isSubmitting}>
              {isSubmitting ? 'Submitting request...' : 'Request Admin Approval'}
            </Button>

            <p className="text-sm text-muted-foreground text-center">
              Already approved? <Link to="/tech/login" className="text-[#3b8d4f] hover:underline">Sign in</Link>
            </p>

            <p className="text-sm text-muted-foreground text-center">
              <button
                type="button"
                className="text-[#2F8E92] hover:underline"
                onClick={() => navigate('/admin/login')}
              >
                Admin login
              </button>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
