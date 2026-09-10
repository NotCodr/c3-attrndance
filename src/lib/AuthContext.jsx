// connect3's own session state.
//
// Replaces the previous Base44 flow, which bounced people to a hosted login page
// on another domain and could not create accounts from inside the app.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, clearToken, getToken, setToken } from '@/lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [clubs, setClubs] = useState([]);
  // Start loading only if a token exists; otherwise we already know the answer
  // and can render the public site without a round trip.
  const [loading, setLoading] = useState(!!getToken());

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setClubs([]);
      setLoading(false);
      return null;
    }
    try {
      const { user: me, clubs: myClubs } = await api.get('auth/me');
      setUser(me);
      setClubs(myClubs || []);
      return me;
    } catch (err) {
      // 401 means the token is expired or revoked; anything else leaves the
      // session alone so a blip doesn't sign people out mid-event.
      if (err.status === 401) {
        clearToken();
        setUser(null);
        setClubs([]);
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = useCallback(async (email, password) => {
    const { token } = await api.call('auth/login', { email, password }, { auth: false });
    setToken(token);
    await refresh();
  }, [refresh]);

  const signup = useCallback(
    (email, password, fullName) =>
      api.call('auth/register', { email, password, full_name: fullName }, { auth: false }),
    [],
  );

  const verifyEmail = useCallback(async (email, code) => {
    const { token } = await api.call('auth/verify-email', { email, code }, { auth: false });
    setToken(token);
    await refresh();
  }, [refresh]);

  const resendCode = useCallback(
    (email) => api.call('auth/resend-code', { email }, { auth: false }),
    [],
  );

  const forgotPassword = useCallback(
    (email) => api.call('auth/forgot-password', { email }, { auth: false }),
    [],
  );

  const resetPassword = useCallback(
    (token, password) => api.call('auth/reset-password', { token, password }, { auth: false }),
    [],
  );

  const logout = useCallback(async () => {
    // Revoke server-side, but drop the local session regardless so a failed
    // request can never leave someone stuck signed in.
    await api.call('auth/logout').catch(() => {});
    clearToken();
    setUser(null);
    setClubs([]);
  }, []);

  const value = useMemo(
    () => ({
      user,
      clubs,
      loading,
      isAuthenticated: !!user,
      refresh,
      login,
      signup,
      verifyEmail,
      resendCode,
      forgotPassword,
      resetPassword,
      logout,
    }),
    [user, clubs, loading, refresh, login, signup, verifyEmail, resendCode, forgotPassword, resetPassword, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
