import React, { useEffect, useRef, useState } from 'react';
import { Outlet, Link, useLocation, useParams, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useAuth } from '@/lib/AuthContext';
import { db } from '@/api/db';
import { canEditEvents } from '@/lib/clubs';
import { copyText } from '@/lib/clipboard';
import { cn } from '@/lib/utils';
import Logo from '@/components/Logo';
import InitialsAvatar from '@/components/InitialsAvatar';
import {
  BarChart3, Calendar, CalendarDays, Check, ChevronDown, CircleUser, ExternalLink, LogOut, Menu, Plus,
  Settings, Users, X,
} from 'lucide-react';

const EASE = [0.16, 1, 0.3, 1];

/**
 * One definition of the club navigation, shared by the rail and the phone menu.
 * Grants are not a destination of their own: each event carries its grant pack,
 * and the overview flags any pack still to finish.
 */
function clubNav(clubSlug, upcoming) {
  return [
    { to: `/c/${clubSlug}`, icon: CalendarDays, label: 'overview', end: true },
    { to: `/c/${clubSlug}/events`, icon: Calendar, label: 'events', badge: upcoming || null },
    { to: `/c/${clubSlug}/analytics`, icon: BarChart3, label: 'analytics' },
    { to: `/c/${clubSlug}/committee`, icon: Users, label: 'committee' },
    { to: `/c/${clubSlug}/settings`, icon: Settings, label: 'settings' },
  ];
}

function isActive(pathname, item) {
  return item.end ? pathname === item.to : pathname.startsWith(item.to);
}

function RailLink({ item, active, onClick, layoutId }) {
  return (
    <Link
      to={item.to}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm transition-colors',
        active ? 'font-bold text-white' : 'font-medium text-[#3A3260] hover:bg-[#EDE7FF]',
      )}
    >
      {/* One pill that slides between items, rather than five independent swaps. */}
      {active && (
        <motion.span
          layoutId={layoutId}
          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          className="absolute inset-0 rounded-2xl border-2 border-[hsl(var(--c3-ink))] bg-[#8E6FE8] shadow-[0_3px_0_0_hsl(var(--c3-ink))]"
        />
      )}
      <item.icon className="relative z-10 h-[17px] w-[17px] shrink-0" strokeWidth={2.3} />
      <span className="relative z-10">{item.label}</span>
      {item.badge ? (
        <span
          className={cn(
            'relative z-10 ml-auto rounded-full border-[1.5px] px-2 text-[11px] font-bold leading-5',
            active ? 'border-white/80 bg-white/20 text-white' : 'border-[hsl(var(--c3-ink))] bg-[#FFE0EC] text-[hsl(var(--c3-ink))]',
          )}
        >
          {item.badge}
        </span>
      ) : null}
    </Link>
  );
}

/**
 * The card at the foot of the rail says the one useful thing for right now:
 * with an event on or within a day, how to get a scanner on the door;
 * otherwise, the club's public page to share.
 */
function RailCard({ club, doorEvent }) {
  if (doorEvent) {
    const live = new Date(doorEvent.starts_at).getTime() <= Date.now();
    return (
      <div className="rounded-[20px] border-2 border-[hsl(var(--c3-ink))] bg-[#FFF4D9] p-3.5 shadow-[0_4px_0_0_hsl(var(--c3-ink))]">
        <img src="/brand/sticker-yellow.png" alt="" className="mb-2 h-9 w-9" />
        <p className="font-display text-sm font-semibold">{live ? 'Doors are open' : 'Door duty soon'}</p>
        <p className="mt-1 text-xs leading-relaxed text-[#4A4270]">
          Send the scanner for {doorEvent.title} to whoever's on the door. They'll need a committee login.
        </p>
        <button
          type="button"
          onClick={() => copyText(`${window.location.origin}/c/${club.slug}/events/${doorEvent.id}/scan`, 'Scanner link copied')}
          className="mt-2.5 rounded-full border-2 border-[hsl(var(--c3-ink))] bg-white px-3 py-1.5 text-xs font-bold transition hover:bg-[#FFFDFA]"
        >
          copy scanner link
        </button>
      </div>
    );
  }
  return (
    <div className="rounded-[20px] border-2 border-[hsl(var(--c3-ink))] bg-[#EDE7FF] p-3.5 shadow-[0_4px_0_0_hsl(var(--c3-ink))]">
      <img src="/brand/logo-sticker.webp" alt="" className="mb-2 h-9 w-10" />
      <p className="font-display text-sm font-semibold">Your club page</p>
      <p className="mt-1 text-xs leading-relaxed text-[#4A4270]">Every published event in one link to share.</p>
      <div className="mt-2.5 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => copyText(`${window.location.origin}/p/${club.slug}`, 'Club page link copied')}
          className="rounded-full border-2 border-[hsl(var(--c3-ink))] bg-white px-3 py-1.5 text-xs font-bold transition hover:bg-[#FFFDFA]"
        >
          copy link
        </button>
        <a
          href={`/p/${club.slug}`}
          target="_blank"
          rel="noreferrer"
          aria-label="Open club page"
          className="grid h-8 w-8 place-items-center rounded-full text-[#3A3260] transition hover:bg-white"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  );
}

function useDismiss(open, setOpen, ref) {
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen, ref]);
}

const menuMotion = (reduce) => ({
  initial: reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.97 },
  transition: { duration: 0.16, ease: EASE },
});

function AccountMenu({ user, onLogout, reduce }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useDismiss(open, setOpen, ref);
  const name = user?.full_name || user?.email || '';

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Account menu"
        className="rounded-full transition hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--c3-purple))] focus-visible:ring-offset-2"
      >
        <InitialsAvatar name={name} size={38} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            {...menuMotion(reduce)}
            className="absolute right-0 top-full z-40 mt-2 w-64 origin-top-right rounded-2xl border-2 border-[hsl(var(--c3-ink))] bg-white p-1.5 shadow-[0_5px_0_0_hsl(var(--c3-ink))]"
          >
            <div className="px-3 py-2.5">
              <p className="truncate text-sm font-semibold">{user?.full_name || 'Your account'}</p>
              <p className="truncate text-xs text-[#4A4270]">{user?.email}</p>
            </div>
            <div className="my-1 border-t-2 border-dashed border-[#E4DEF7]" />
            <Link to="/account" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium hover:bg-[#EDE7FF]">
              <CircleUser className="h-4 w-4" /> account
            </Link>
            <button type="button" onClick={onLogout} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium hover:bg-[#EDE7FF]">
              <LogOut className="h-4 w-4" /> sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function AppShell() {
  const location = useLocation();
  const { clubSlug } = useParams();
  const navigate = useNavigate();
  const { user, clubs, logout } = useAuth();
  const reduce = useReducedMotion();

  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [clubEvents, setClubEvents] = useState([]);
  const switcherRef = useRef(null);
  useDismiss(switcherOpen, setSwitcherOpen, switcherRef);

  const activeClub = clubs.find((c) => c.slug === clubSlug);
  const inClub = !!clubSlug;

  // Published events feed the rail: the upcoming count, and whether an event is
  // close enough to need a scanner on the door. Refreshed as you move around, so
  // publishing an event shows up without a reload.
  useEffect(() => {
    if (!activeClub?.id) { setClubEvents([]); return undefined; }
    let live = true;
    db.Event.filter({ club_id: activeClub.id, status: 'published' }, '-starts_at', 100)
      .then((rows) => { if (live) setClubEvents(rows); })
      .catch(() => {});
    return () => { live = false; };
  }, [activeClub?.id, location.pathname]);

  useEffect(() => { setMenuOpen(false); setSwitcherOpen(false); }, [location.pathname]);

  const now = Date.now();
  const endOf = (e) => new Date(e.ends_at || e.starts_at).getTime();
  const upcomingCount = clubEvents.filter((e) => endOf(e) >= now).length;
  const doorEvent = clubEvents
    .filter((e) => endOf(e) >= now && new Date(e.starts_at).getTime() - now <= 24 * 36e5)
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))[0];
  const nav = inClub ? clubNav(clubSlug, upcomingCount) : [];
  const canCreate = inClub && canEditEvents(activeClub?.role);

  const onLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  return (
    <div className="c3-clubroom flex min-h-screen flex-col text-[hsl(var(--c3-ink))]">
      <header className="sticky top-0 z-30 border-b-2 border-[hsl(var(--c3-ink))] bg-white">
        <div className="flex h-16 items-center justify-between gap-2 px-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-1.5 sm:gap-3">
            {inClub && (
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-[#EDE7FF] md:hidden"
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </button>
            )}

            {/* In a club on a phone the menu button leads everywhere, so the logo
                steps aside for the club name. */}
            <Link to="/dashboard" className={cn('shrink-0 items-center gap-2 rounded-full pr-1', inClub ? 'hidden sm:flex' : 'flex')}>
              <Logo size={32} />
              <span className="hidden font-display text-[19px] font-bold tracking-tight lg:inline">connect3</span>
            </Link>

            {clubs.length > 0 && (
              <>
                <span aria-hidden="true" className="hidden h-7 w-px bg-[#DDD8F0] sm:block" />
                <div className="relative min-w-0" ref={switcherRef}>
                  <button
                    type="button"
                    onClick={() => setSwitcherOpen((v) => !v)}
                    aria-expanded={switcherOpen}
                    className="flex min-w-0 items-center gap-2 rounded-full border-2 border-[hsl(var(--c3-ink))] bg-[#EDE7FF] py-1 pl-1 pr-2.5 text-sm font-semibold transition hover:bg-[#E3DAFF]"
                  >
                    <InitialsAvatar name={activeClub?.name || '?'} src={activeClub?.logo_url} size={26} />
                    <span className="min-w-0 max-w-[9rem] truncate sm:max-w-[15rem]">{activeClub?.name || 'choose a club'}</span>
                    {activeClub?.role && (
                      <span className="hidden rounded-full bg-white/80 px-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#6D4FD8] sm:inline">
                        {activeClub.role}
                      </span>
                    )}
                    <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', switcherOpen && 'rotate-180')} strokeWidth={2.4} />
                  </button>

                  <AnimatePresence>
                    {switcherOpen && (
                      <motion.div
                        {...menuMotion(reduce)}
                        className="absolute left-0 top-full z-40 mt-2 w-72 origin-top-left rounded-2xl border-2 border-[hsl(var(--c3-ink))] bg-white p-1.5 shadow-[0_5px_0_0_hsl(var(--c3-ink))]"
                      >
                        {clubs.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => { setSwitcherOpen(false); navigate(`/c/${c.slug}`); }}
                            className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm hover:bg-[#EDE7FF]"
                          >
                            <InitialsAvatar name={c.name} src={c.logo_url} size={28} />
                            <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                            <span className="shrink-0 text-xs text-[#4A4270]">{c.role}</span>
                            {c.slug === clubSlug && <Check className="h-4 w-4 shrink-0 text-[#6D4FD8]" />}
                          </button>
                        ))}
                        <div className="my-1 border-t-2 border-dashed border-[#E4DEF7]" />
                        <Link to="/onboard" className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium hover:bg-[#EDE7FF]">
                          <Plus className="h-4 w-4" /> create a new club
                        </Link>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {canCreate && (
              <Link to={`/c/${clubSlug}/events/new`} className="ink-btn ink-btn-primary px-3 py-2 sm:px-4" aria-label="New event">
                <Plus className="h-4 w-4" strokeWidth={2.8} />
                <span className="hidden sm:inline">new event</span>
              </Link>
            )}
            <AccountMenu user={user} onLogout={onLogout} reduce={reduce} />
          </div>
        </div>
      </header>

      {/* Phone navigation drawer */}
      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setMenuOpen(false)}
              className="fixed inset-0 z-40 bg-[#15102B]/40 backdrop-blur-sm md:hidden"
            />
            <motion.nav
              initial={reduce ? { opacity: 0 } : { x: '-100%' }}
              animate={reduce ? { opacity: 1 } : { x: 0 }}
              exit={reduce ? { opacity: 0 } : { x: '-100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 38 }}
              className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r-2 border-[hsl(var(--c3-ink))] bg-[#FFFDFA] md:hidden"
              aria-label="Club navigation"
            >
              <div className="flex h-16 items-center justify-between gap-2 border-b-2 border-[hsl(var(--c3-ink))] px-4">
                <span className="flex min-w-0 items-center gap-2">
                  <InitialsAvatar name={activeClub?.name || '?'} src={activeClub?.logo_url} size={28} />
                  <span className="truncate font-display font-bold">{activeClub?.name || 'menu'}</span>
                </span>
                <button type="button" onClick={() => setMenuOpen(false)} className="grid h-10 w-10 place-items-center rounded-full hover:bg-[#EDE7FF]" aria-label="Close menu">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-1.5 overflow-y-auto p-3">
                {nav.map((item) => (
                  <RailLink key={item.to} item={item} layoutId="c3-rail-mobile" active={isActive(location.pathname, item)} onClick={() => setMenuOpen(false)} />
                ))}
              </div>
              <div className="mt-auto space-y-3 p-3">
                {activeClub && <RailCard club={activeClub} doorEvent={doorEvent} />}
                {canCreate && (
                  <Link to={`/c/${clubSlug}/events/new`} className="ink-btn ink-btn-primary w-full py-2.5">
                    <Plus className="h-4 w-4" strokeWidth={2.8} /> new event
                  </Link>
                )}
              </div>
            </motion.nav>
          </>
        )}
      </AnimatePresence>

      <div className="flex flex-1">
        {inClub && activeClub && (
          <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-[208px] shrink-0 flex-col gap-6 overflow-y-auto border-r-2 border-[hsl(var(--c3-ink))] bg-[#FFFDFA] px-3.5 py-5 md:flex lg:w-[232px] lg:px-4">
            <nav className="space-y-1.5" aria-label="Club">
              {nav.map((item) => (
                <RailLink key={item.to} item={item} layoutId="c3-rail" active={isActive(location.pathname, item)} />
              ))}
            </nav>
            <div className="mt-auto">
              <RailCard club={activeClub} doorEvent={doorEvent} />
            </div>
          </aside>
        )}

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-7 sm:py-8">
          <div className={inClub ? 'max-w-[1120px]' : 'mx-auto max-w-5xl'}>
            {/* A short cross-fade on navigation, so pages arrive instead of blinking. */}
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
                transition={{ duration: 0.22, ease: EASE }}
              >
                <Outlet context={{ user, clubs, activeClub }} />
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
}
