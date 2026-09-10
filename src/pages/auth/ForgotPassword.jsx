import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import AuthLayout, { AuthError } from '@/components/AuthLayout';
import { Loader2, MailCheck } from 'lucide-react';

export default function ForgotPassword() {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(err.message || 'Could not send the reset link.');
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <AuthLayout
        title="check your email"
        subtitle="If an account exists for that address, a reset link is on its way."
        footer={<Link to="/login" className="text-primary hover:underline">back to sign in</Link>}
      >
        <div className="text-center py-2">
          <MailCheck className="w-10 h-10 text-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            The link expires in an hour and can only be used once.
          </p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="reset your password"
      subtitle="we'll email you a link to set a new one"
      footer={<Link to="/login" className="text-primary hover:underline">back to sign in</Link>}
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
        <button disabled={busy} className="c3-btn-primary w-full py-3 text-base justify-center">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} send reset link
        </button>
      </form>
    </AuthLayout>
  );
}
