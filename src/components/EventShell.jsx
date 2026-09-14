import React from 'react';
import { Link } from 'react-router-dom';
import EventBackdrop from '@/components/EventBackdrop';
import FloatingScrollbar from '@/components/FloatingScrollbar';
import Logo from '@/components/Logo';

/**
 * The frame every attendee screen shares, so the event page, the moment after
 * RSVPing and the ticket read as one flow: the same moving background, the same
 * floating scrollbar in place of the native one, and the same light top bar.
 * `tone="dark"` swaps the moving background for the dark stage the lanyard
 * ticket hangs in.
 */
export default function EventShell({ palette, children, navRight = null, bottomInset = 0, tone = 'vivid' }) {
  return (
    <div className="relative min-h-screen text-white">
      {tone === 'dark' ? (
        <div
          aria-hidden="true"
          className="fixed inset-0 -z-10 bg-[#0C0C0E]"
          style={{ background: 'radial-gradient(ellipse 90% 60% at 50% 20%, #1C1C20 0%, #0C0C0E 55%, #000 100%)' }}
        />
      ) : (
        <EventBackdrop palette={palette} />
      )}
      <FloatingScrollbar bottomInset={bottomInset} />
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 pt-5 sm:px-8 sm:pt-7">
        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-full pr-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <Logo size={28} white />
          <span className="font-display text-lg font-bold tracking-tight text-white">connect3</span>
        </Link>
        {navRight}
      </header>
      {children}
    </div>
  );
}

/** A frosted white card that holds readable content over the background. */
export function GlassCard({ as: Tag = 'div', className = '', children, ...rest }) {
  return (
    <Tag
      className={`rounded-3xl bg-white/[0.92] text-foreground shadow-[0_24px_60px_-24px_rgba(20,0,60,0.6)] ring-1 ring-white/70 backdrop-blur-xl ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/**
 * The quieter button beside a CrtButton. Tinted dark rather than white, so its
 * white label still reads over the palest part of the background.
 */
export function GlassButton({ to, href, onClick, children, className = '', ...rest }) {
  const classes = `inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[#14003c]/30 px-4 text-sm font-medium text-white
    ring-1 ring-inset ring-white/25 backdrop-blur-md transition hover:bg-[#14003c]/45 [text-shadow:0_1px_8px_rgba(20,0,60,0.35)]
    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${className}`;
  if (to) return <Link to={to} className={classes} {...rest}>{children}</Link>;
  if (href) return <a href={href} className={classes} {...rest}>{children}</a>;
  return <button type="button" onClick={onClick} className={classes} {...rest}>{children}</button>;
}
