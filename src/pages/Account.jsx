import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/lib/api';
import { Loader2, LogOut } from 'lucide-react';
import { toast } from 'sonner';

const PASSWORD_MIN = 10;

export default function Account() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

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
      <p className="text-sm text-muted-foreground mb-6">Your sign-in details.</p>

      <div className="c3-card p-5 space-y-3 text-sm mb-8">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">name</span>
          <span className="truncate">{user?.full_name || '—'}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">email</span>
          <span className="truncate">{user?.email || '—'}</span>
        </div>
      </div>

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
