import React, { useEffect, useRef, useState } from 'react';
import { Outlet, Link, useLocation, useParams, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useAuth } from '@/lib/AuthContext';
import { cn } from '@/lib/utils';
import Logo from '@/components/Logo';
import {
  BarChart3, Calendar, CalendarDays, Check, ChevronDown, FileText,
  LogOut, Menu, Plus, Settings, Users, X,
} from 'lucide-react';

const EASE = [0.16, 1, 0.3, 1];

/** One definition of the club navigation, shared by the sidebar and the phone menu. */
function clubNav(clubSlug) {
  return [
    { to: `/c/${clubSlug}`, icon: CalendarDays, label: 'overview', end: true },
    { to: `/c/${clubSlug}/events`, icon: Calendar, label: 'events' },
    { to: `/c/${clubSlug}/analytics`, icon: BarChart3, label: 'analytics' },
    { to: `/c/${clubSlug}/grants`, icon: FileText, label: 'grants' },
    { to: `/c/${clubSlug}/committee`, icon: Users, label: 'committee' },
    { to: `/c/${clubSlug}/settings`, icon: Settings, label: 'settings' },
  ];
}

function isActive(pathname, item) {
  return item.end ? pathname === item.to : pathname.startsWith(item.to);
}

function NavLink({ item, active, onClick, layoutId }) {
  return (
    <Link
      to={item.to}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
        active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60',
      )}
    >
      {/* A pill that slides between items, rather than six independent swaps. */}
      {active && (
        <motion.span
          layoutId={layoutId}
          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          className="absolute inset-0 rounded-lg bg-secondary"
        />
      )}
      <item.icon className="w-4 h-4 relative z-10 shrink-0" />
      <span className="relative z-10">{item.label}</span>
    </Link>
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
  const switcherRef = useRef(null);

  const activeClub = clubs.find((c) => c.slug === clubSlug);
  const inClub = !!clubSlug;
  const nav = inClub ? clubNav(clubSlug) : [];

  // The switcher used to stay open until clicked again, even after clicking
  // elsewhere or pressing escape.
  useEffect(() => {
    if (!switcherOpen) return;
    const onDown = (e) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target)) setSwitcherOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setSwitcherOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [switcherOpen]);

  useEffect(() => { setMenuOpen(false); setSwitcherOpen(false); }, [location.pathname]);

  const onLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-background/80 backdrop-blur-xl sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {/* Phone menu. Without it there was no way to reach events,
                committee or settings on a phone at all. */}
            {inClub && (
              <button onClick={() => setMenuOpen(true)} className="md:hidden c3-btn-ghost -ml-2" aria-label="Open menu">
                <Menu className="w-5 h-5" />
              </button>
            )}

            <Link to="/dashboard" className="flex items-center gap-2 shrink-0">
              <Logo size={30} />
              <span className="font-display font-bold text-lg tracking-tight hidden sm:inline">connect3</span>
            </Link>

            {clubs.length > 0 && (
              <div className="relative min-w-0" ref={switcherRef}>
                <button
                  onClick={() => setSwitcherOpen((v) => !v)}
                  aria-expanded={switcherOpen}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full border-2 border-border bg-card text-sm hover:bg-secondary/60 transition min-w-0"
                >
                  <span className="truncate max-w-[9rem] sm:max-w-none">{activeClub?.name || 'choose club'}</span>
                  <ChevronDown className={cn('w-3.5 h-3.5 text-muted-foreground transition-transform shrink-0', switcherOpen && 'rotate-180')} />
                </button>

                <AnimatePresence>
                  {switcherOpen && (
                    <motion.div
                      initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.97 }}
                      transition={{ duration: 0.16, ease: EASE }}
                      className="absolute top-full mt-2 left-0 w-64 c3-card p-1 z-40 shadow-xl origin-top"
                    >
                      {clubs.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => { setSwitcherOpen(false); navigate(`/c/${c.slug}`); }}
                          className="w-full text-left px-3 py-2 rounded-md hover:bg-secondary text-sm flex items-center justify-between gap-2"
                        >
                          <span className="truncate">{c.name}</span>
                          <span className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-muted-foreground">{c.role}</span>
                            {c.slug === clubSlug && <Check className="w-3.5 h-3.5 text-primary" />}
                          </span>
                        </button>
                      ))}
                      <div className="border-t border-border my-1" />
                      <Link to="/onboard" className="w-full px-3 py-2 rounded-md hover:bg-secondary text-sm flex items-center gap-2">
                        <Plus className="w-3.5 h-3.5" /> create new club
                      </Link>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {user && (
              <Link to="/account" className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hidden sm:inline-block max-w-[14rem] truncate">
                {user.email}
              </Link>
            )}
            <Link to="/account" className="c3-btn-ghost sm:hidden" aria-label="Account">
              <Settings className="w-4 h-4" />
            </Link>
            <button onClick={onLogout} className="c3-btn-ghost" title="sign out" aria-label="Sign out">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Phone navigation drawer */}
      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setMenuOpen(false)}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 md:hidden"
            />
            <motion.nav
              initial={reduce ? { opacity: 0 } : { x: '-100%' }}
              animate={reduce ? { opacity: 1 } : { x: 0 }}
              exit={reduce ? { opacity: 0 } : { x: '-100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 38 }}
              className="fixed inset-y-0 left-0 w-72 max-w-[85vw] bg-card border-r border-border z-50 md:hidden flex flex-col"
              aria-label="Club navigation"
            >
              <div className="flex items-center justify-between px-4 h-16 border-b border-border">
                <p className="font-display font-bold truncate">{activeClub?.name || 'menu'}</p>
                <button onClick={() => setMenuOpen(false)} className="c3-btn-ghost" aria-label="Close menu">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-3 space-y-1 overflow-y-auto">
                {nav.map((item) => (
                  <NavLink
                    key={item.to}
                    item={item}
                    layoutId="c3-nav-mobile"
                    active={isActive(location.pathname, item)}
                    onClick={() => setMenuOpen(false)}
                  />
                ))}
              </div>
              <div className="mt-auto p-3 border-t border-border">
                <Link to={`/c/${clubSlug}/events/new`} className="c3-btn-primary w-full justify-center">
                  <Plus className="w-4 h-4" /> create event
                </Link>
              </div>
            </motion.nav>
          </>
        )}
      </AnimatePresence>

      <div className="flex-1 flex max-w-7xl mx-auto w-full">
        {inClub && activeClub && (
          <aside className="hidden md:block w-56 shrink-0 border-r border-border px-3 py-6">
            <p className="text-xs uppercase tracking-wider text-muted-foreground px-3 mb-3 truncate">
              {activeClub.name}
            </p>
            <nav className="space-y-1">
              {nav.map((item) => (
                <NavLink
                  key={item.to}
                  item={item}
                  layoutId="c3-nav-desktop"
                  active={isActive(location.pathname, item)}
                />
              ))}
            </nav>
          </aside>
        )}

        <main className="flex-1 min-w-0 px-4 sm:px-6 py-6 sm:py-8">
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
        </main>
      </div>
    </div>
  );
}
