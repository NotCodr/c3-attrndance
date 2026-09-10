import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import AuthLayout, { AuthError } from '@/components/AuthLayout';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const PASSWORD_MIN = 10;

export default function ResetPassword() {
  const { resetPassword } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const tooShort = password.length > 0 && password.length < PASSWORD_MIN;
  const mismatch = confirm.length > 0 && confirm !== password;

  const submit = async (e) => {
    e.preventDefault();
    if (tooShort || mismatch) return;
    setError('');
    setBusy(true);
    try {
      await resetPassword(token, password);
      toast.success('Password updated. Sign in with your new password.');
      navigate('/login', { replace: true });
    } catch (err) {
      setError(err.message || 'Could not reset your password.');
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <AuthLayout
        title="link not valid"
        subtitle="This reset link is missing its token."
        footer={<Link to="/forgot-password" className="text-primary hover:underline">request a new link</Link>}
      >
        <p className="text-sm text-muted-foreground text-center py-2">
          Open the link straight from your email, or request a fresh one.
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="choose a new password" subtitle="this signs out any other devices">
      <form onSubmit={submit} className="space-y-4">
        <AuthError>{error}</AuthError>

        <div>
          <label className="c3-label" htmlFor="password">new password</label>
          <input
            id="password" type="password" className="c3-input" autoComplete="new-password" required autoFocus
            minLength={PASSWORD_MIN}
            value={password} onChange={(e) => setPassword(e.target.value)}
          />
          <p className={`text-xs mt-1 ${tooShort ? 'text-destructive' : 'text-muted-foreground'}`}>
            At least {PASSWORD_MIN} characters.
          </p>
        </div>

        <div>
          <label className="c3-label" htmlFor="confirm">confirm password</label>
          <input
            id="confirm" type="password" className="c3-input" autoComplete="new-password" required
            value={confirm} onChange={(e) => setConfirm(e.target.value)}
          />
          {mismatch && <p className="text-xs text-destructive mt-1">Those don't match.</p>}
        </div>

        <button
          disabled={busy || tooShort || mismatch || !password}
          className="c3-btn-primary w-full py-3 text-base justify-center"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} update password
        </button>
      </form>
    </AuthLayout>
  );
}
