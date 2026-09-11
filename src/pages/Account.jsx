import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/lib/api';
import { formatPhone, phoneProblem } from '@/lib/phone';
import { Loader2, LogOut } from 'lucide-react';
import { toast } from 'sonner';

const PASSWORD_MIN = 10;

export default function Account() {
  const { user, logout, refresh } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState(user?.full_name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [savingDetails, setSavingDetails] = useState(false);
  useEffect(() => {
    setName(user?.full_name || '');
    setPhone(user?.phone || '');
  }, [user?.full_name, user?.phone]);
  const phoneError = phoneProblem(phone);
  const detailsChanged = name.trim() !== (user?.full_name || '')
    || (phone.trim() ? formatPhone(phone) : '') !== (user?.phone || '');

  const saveDetails = async (e) => {
    e.preventDefault();
    if (!name.trim() || phoneError) return;
    setSavingDetails(true);
    try {
      await api.call('auth/profile', { full_name: name.trim(), phone: phone.trim() ? formatPhone(phone) : null });
      await refresh();
      toast.success('Details saved');
    } catch (err) {
      toast.error(err.message || 'Could not save your details.');
    } finally {
      setSavingDetails(false);
    }
  };

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const tooShort = next.length > 0 && next.length < PASSWORD_MIN;
  const mismatch = confirm.length > 0 && confirm !== next;

  const changePassword = async (e) => {
    e.preventDefault();
    if (tooShort || mismatch || !current || !next) return;
    setError('');
    setBusy(true);
    try {
      await api.call('auth/change-password', { current_password: current, new_password: next });
      setCurrent(''); setNext(''); setConfirm('');
      toast.success('Password updated. Other devices have been signed out.');
    } catch (err) {
      setError(err.message || 'Could not change your password.');
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  return (
    <div className="max-w-2xl">
      <h1 className="font-display font-bold text-3xl mb-1">account</h1>
      <p className="text-sm text-muted-foreground mb-6">Signed in as {user?.email}.</p>

      <h2 className="text-sm text-muted-foreground mb-3">your details</h2>
      <form onSubmit={saveDetails} className="c3-card p-5 space-y-4 mb-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="c3-label" htmlFor="acc-name">name</label>
            <input id="acc-name" className="c3-input" autoComplete="name" maxLength={120} required
              value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="c3-label" htmlFor="acc-phone">
              phone <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <input id="acc-phone" type="tel" inputMode="tel" className="c3-input" autoComplete="tel" maxLength={32}
              placeholder="04xx xxx xxx" value={phone}
              onChange={(e) => setPhone(e.target.value)} onBlur={() => setPhone(formatPhone(phone))} />
            {phoneError && <p className="text-xs text-destructive mt-1">{phoneError}</p>}
          </div>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            New events use these as the contact, which goes on grant packs for UMSU.
          </p>
          <button disabled={!detailsChanged || savingDetails || !!phoneError || !name.trim()} className="c3-btn-primary shrink-0">
            {savingDetails && <Loader2 className="w-4 h-4 animate-spin" />} save details
          </button>
        </div>
      </form>

      <h2 className="text-sm text-muted-foreground mb-3">change password</h2>
      <form onSubmit={changePassword} className="c3-card p-5 space-y-4 mb-8">
        {error && (
          <p role="alert" className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
        <div>
          <label className="c3-label" htmlFor="current">current password</label>
          <input
            id="current" type="password" className="c3-input" autoComplete="current-password"
            value={current} onChange={(e) => setCurrent(e.target.value)} required
          />
        </div>
        <div>
          <label className="c3-label" htmlFor="next">new password</label>
          <input
            id="next" type="password" className="c3-input" autoComplete="new-password"
            minLength={PASSWORD_MIN}
            value={next} onChange={(e) => setNext(e.target.value)} required
          />
          <p className={`text-xs mt-1 ${tooShort ? 'text-destructive' : 'text-muted-foreground'}`}>
            At least {PASSWORD_MIN} characters. This signs out your other devices.
          </p>
        </div>
        <div>
          <label className="c3-label" htmlFor="confirm">confirm new password</label>
          <input
            id="confirm" type="password" className="c3-input" autoComplete="new-password"
            value={confirm} onChange={(e) => setConfirm(e.target.value)} required
          />
          {mismatch && <p className="text-xs text-destructive mt-1">Those don't match.</p>}
        </div>
        <button disabled={busy || tooShort || mismatch} className="c3-btn-primary">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} update password
        </button>
      </form>

      <button onClick={signOut} className="c3-btn-secondary">
        <LogOut className="w-4 h-4" /> sign out
      </button>
    </div>
  );
}
