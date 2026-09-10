import React, { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import AuthLayout, { AuthError } from '@/components/AuthLayout';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_S = 60;

export default function VerifyEmail() {
  const { verifyEmail, resendCode } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const email = location.state?.email;

  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_S);
  const submittedFor = useRef('');

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const submit = async (e) => {
    e?.preventDefault();
    if (code.length !== CODE_LENGTH || busy) return;
    setError('');
    setBusy(true);
    try {
      await verifyEmail(email, code);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.message || 'That code did not work.');
      setCode('');
      submittedFor.current = '';
    } finally {
      setBusy(false);
    }
  };

  // Submit as soon as the sixth digit lands, so nobody has to hunt for a button
  // after typing a code they just read off their phone.
  useEffect(() => {
    if (code.length === CODE_LENGTH && submittedFor.current !== code) {
      submittedFor.current = code;
      submit();
    }
  }, [code]);  

  const resend = async () => {
    setError('');
    try {
      await resendCode(email);
      setCooldown(RESEND_COOLDOWN_S);
      toast.success('New code sent.');
    } catch (err) {
      setError(err.message || 'Could not resend the code.');
    }
  };

  // Reached directly, with no signup in progress.
  if (!email) return <Navigate to="/signup" replace />;

  return (
    <AuthLayout
      title="check your email"
      subtitle={`We sent a ${CODE_LENGTH}-digit code to ${email}`}
      footer={<><Link to="/signup" className="text-primary hover:underline">use a different email</Link></>}
    >
      <form onSubmit={submit} className="space-y-4">
        <AuthError>{error}</AuthError>

        <div>
          <label className="c3-label" htmlFor="code">verification code</label>
          <input
            id="code"
            className="c3-input text-center text-2xl tracking-[0.4em] font-mono"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={CODE_LENGTH}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
          />
        </div>

        <button
          disabled={busy || code.length !== CODE_LENGTH}
          className="c3-btn-primary w-full py-3 text-base justify-center"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} verify
        </button>

        <button
          type="button"
          onClick={resend}
          disabled={cooldown > 0}
          className="c3-btn-ghost w-full text-xs justify-center disabled:opacity-50"
        >
          {cooldown > 0 ? `resend code in ${cooldown}s` : 'resend code'}
        </button>
      </form>
    </AuthLayout>
  );
}
