import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import AuthLayout, { AuthError } from '@/components/AuthLayout';
import { Loader2 } from 'lucide-react';

const PASSWORD_MIN = 10;

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const tooShort = password.length > 0 && password.length < PASSWORD_MIN;

  const submit = async (e) => {
    e.preventDefault();
    if (tooShort) return;
    setError('');
    setBusy(true);
    try {
      await signup(email, password, fullName);
      navigate('/verify', { state: { email } });
    } catch (err) {
      setError(err.message || 'Could not create your account.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="start running your club"
      subtitle="events, attendance and grant acquittals in one place"
      footer={<>already have an account? <Link to="/login" className="text-primary hover:underline">sign in</Link></>}
    >
      <form onSubmit={submit} className="space-y-4">
        <AuthError>{error}</AuthError>

        <div>
          <label className="c3-label" htmlFor="name">your name</label>
          <input
            id="name" className="c3-input" autoComplete="name" required autoFocus maxLength={100}
            value={fullName} onChange={(e) => setFullName(e.target.value)}
          />
        </div>

        <div>
          <label className="c3-label" htmlFor="email">email</label>
          <input
            id="email" type="email" className="c3-input" autoComplete="email" required
            value={email} onChange={(e) => setEmail(e.target.value)}
          />
          <p className="text-xs text-muted-foreground mt-1">Use the address your committee can reach you on.</p>
        </div>

        <div>
          <label className="c3-label" htmlFor="password">password</label>
          <input
            id="password" type="password" className="c3-input" autoComplete="new-password" required
            minLength={PASSWORD_MIN}
            value={password} onChange={(e) => setPassword(e.target.value)}
            aria-describedby="pw-hint"
          />
          <p id="pw-hint" className={`text-xs mt-1 ${tooShort ? 'text-destructive' : 'text-muted-foreground'}`}>
            At least {PASSWORD_MIN} characters. A memorable phrase beats a short scramble.
          </p>
        </div>

        <button disabled={busy || tooShort} className="c3-btn-primary w-full py-3 text-base justify-center">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} create account
        </button>

        <p className="text-xs text-muted-foreground text-center">
          By creating an account you agree to our{' '}
          <Link to="/terms" className="underline">terms</Link> and{' '}
          <Link to="/privacy" className="underline">privacy policy</Link>.
        </p>
      </form>
    </AuthLayout>
  );
}
