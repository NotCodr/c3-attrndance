import React from 'react';
import { Link } from 'react-router-dom';
import Logo from '@/components/Logo';

/** Shared frame for the sign-in, sign-up and password-recovery screens. */
export default function AuthLayout({ title, subtitle, footer, children }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center justify-center gap-2 mb-8">
          <Logo size={40} />
          <span className="font-display font-bold text-2xl tracking-tight">connect3</span>
        </Link>

        <div className="text-center mb-6">
          <h1 className="font-display font-bold text-3xl tracking-tight text-balance">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground mt-2 text-balance">{subtitle}</p>}
        </div>

        <div className="c3-card p-6 sm:p-7">{children}</div>

        {footer && <div className="text-center text-sm text-muted-foreground mt-6">{footer}</div>}
      </div>
    </div>
  );
}

/** Inline error banner. Rendered only when there is something to say. */
export function AuthError({ children }) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2 mb-4"
    >
      {children}
    </p>
  );
}
