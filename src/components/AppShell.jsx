import React, { useState } from 'react';
import { Outlet, Link, useLocation, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { Calendar, Users, Settings, FileText, LogOut, ChevronDown, Plus, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import Logo from '@/components/Logo';

function NavLink({ to, icon: Icon, children, active }) {
  return (
    <Link
      to={to}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition',
        active ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
      )}
    >
      <Icon className="w-4 h-4" />
      <span>{children}</span>
    </Link>
  );
}

export default function AppShell() {
  const location = useLocation();
  const { clubSlug } = useParams();
  const navigate = useNavigate();
  const { user, clubs, logout } = useAuth();
  const [open, setOpen] = useState(false);

  const activeClub = clubs.find((c) => c.slug === clubSlug);
  const inClub = !!clubSlug;

  const onLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <header className="border-b border-border bg-background/80 backdrop-blur-xl sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          <div className="flex items-center gap-4">
            <Link to="/dashboard" className="flex items-center gap-2">
              <Logo size={32} />
              <span className="font-display font-bold text-lg tracking-tight">connect3</span>
            </Link>

            {/* Club switcher */}
            {clubs.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setOpen(!open)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full border-2 border-border bg-card text-sm hover:bg-secondary/60 transition"
                >
                  <span className="text-muted-foreground">club</span>
                  <span>{activeClub?.name || clubs[0]?.name || 'Choose club'}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
                {open && (
                  <div className="absolute top-full mt-1 left-0 w-64 c3-card p-1 z-40 shadow-xl">
                    {clubs.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => { setOpen(false); navigate(`/c/${c.slug}`); }}
                        className="w-full text-left px-3 py-2 rounded-md hover:bg-secondary text-sm flex items-center justify-between"
                      >
                        <span>{c.name}</span>
                        <span className="text-xs text-muted-foreground">{c.role}</span>
                      </button>
                    ))}
                    <div className="border-t border-border my-1" />
                    <Link to="/onboard" onClick={() => setOpen(false)} className="w-full text-left px-3 py-2 rounded-md hover:bg-secondary text-sm flex items-center gap-2">
                      <Plus className="w-3.5 h-3.5" /> create new club
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {user && (
              <Link to="/account" className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hidden sm:inline-block">
                {user.email}
              </Link>
            )}
            <button onClick={onLogout} className="c3-btn-ghost" title="sign out">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex max-w-7xl mx-auto w-full">
        {/* Sidebar — only when inside a club */}
        {inClub && activeClub && (
          <aside className="hidden md:block w-56 shrink-0 border-r border-border px-3 py-6">
            <p className="text-xs uppercase tracking-wider text-muted-foreground px-3 mb-2">{activeClub.name}</p>
            <nav className="space-y-1">
              <NavLink to={`/c/${clubSlug}`} icon={Calendar} active={location.pathname === `/c/${clubSlug}`}>overview</NavLink>
              <NavLink to={`/c/${clubSlug}/events`} icon={Calendar} active={location.pathname.endsWith('/events')}>events</NavLink>
              <NavLink to={`/c/${clubSlug}/analytics`} icon={BarChart3} active={location.pathname.endsWith('/analytics')}>analytics</NavLink>
              <NavLink to={`/c/${clubSlug}/acquittal-packs`} icon={FileText} active={location.pathname.endsWith('/acquittal-packs')}>acquittal packs</NavLink>
              <NavLink to={`/c/${clubSlug}/committee`} icon={Users} active={location.pathname.endsWith('/committee')}>committee</NavLink>
              <NavLink to={`/c/${clubSlug}/settings`} icon={Settings} active={location.pathname.endsWith('/settings')}>settings</NavLink>
            </nav>
          </aside>
        )}

        <main className="flex-1 min-w-0 px-4 sm:px-6 py-6 sm:py-8">
          <Outlet context={{ user, clubs, activeClub }} />
        </main>
      </div>
    </div>
  );
}