import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import AuthLayout, { AuthError } from '@/components/AuthLayout';
import { Loader2 } from 'lucide-react';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Where the user was headed before they were asked to sign in.
  const next = location.state?.from || '/dashboard';

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
      navigate(next, { replace: true });
    } catch (err) {
      // An unverified account isn't a failure, it's an unfinished signup, so
      // send them to the step they never completed rather than a dead end.
      if (err.code === 'email_not_verified') {
        navigate('/verify', { state: { email: err.email || email } });
        return;
      }
      setError(err.message || 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="welcome back"
      subtitle="sign in to run your club"
      footer={<>new here? <Link to="/signup" className="text-primary hover:underline">create an account</Link></>}
    >
      <form onSubmit={submit} className="space-y-4">
        <AuthError>{error}</AuthError>

        <div>
          <label className="c3-label" htmlFor="email">email</label>
          <input
            id="email" type="email" className="c3-input" autoComplete="email" required autoFocus
            value={email} onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="c3-label mb-0" htmlFor="password">password</label>
            <Link to="/forgot-password" className="text-xs text-muted-foreground hover:text-foreground">
              forgot?
            </Link>
          </div>
          <input
            id="password" type="password" className="c3-input" autoComplete="current-password" required
            value={password} onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button disabled={busy} className="c3-btn-primary w-full py-3 text-base justify-center">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} sign in
        </button>
      </form>
    </AuthLayout>
  );
}
