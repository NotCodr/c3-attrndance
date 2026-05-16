import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Home, Compass, Calendar, Briefcase, User, Search, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const navItems = [
  { to: '/', label: 'Feed', icon: Home },
  { to: '/discover', label: 'Discover', icon: Compass },
  { to: '/events', label: 'Events', icon: Calendar },
  { to: '/opportunities', label: 'Opportunities', icon: Briefcase },
];

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const list = await base44.entities.StudentProfile.list();
        const mine = list[0];
        if (mine) {
          setProfile(mine);
          if (!mine.onboarding_complete && location.pathname !== '/onboarding') {
            navigate('/onboarding');
          }
        } else if (location.pathname !== '/onboarding') {
          navigate('/onboarding');
        }
      } catch (e) {
        // ignore
      }
    };
    load();
  }, [location.pathname]);

  // Hide layout chrome on onboarding
  if (location.pathname === '/onboarding') {
    return <Outlet context={{ profile, setProfile }} />;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top nav (desktop) */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-primary-foreground" strokeWidth={2.5} />
              </div>
              <span className="font-display text-2xl font-bold tracking-tight">connect3</span>
            </Link>

            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = location.pathname === item.to;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={cn(
                      'px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2',
                      active
                        ? 'bg-primary text-primary-foreground'
                        : 'text-foreground/70 hover:text-foreground hover:bg-secondary'
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full"
                onClick={() => navigate('/discover')}
              >
                <Search className="w-5 h-5" />
              </Button>
              <Link to="/dashboard">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-accent to-primary flex items-center justify-center text-white font-semibold text-sm">
                  {profile?.display_name?.[0]?.toUpperCase() || 'U'}
                </div>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="pb-24 md:pb-12">
        <Outlet context={{ profile, setProfile }} />
      </main>

      {/* Bottom nav (mobile) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-background/95 backdrop-blur-xl border-t border-border/60">
        <div className="flex items-center justify-around px-2 py-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  'flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-colors',
                  active ? 'text-accent' : 'text-muted-foreground'
                )}
              >
                <Icon className="w-5 h-5" strokeWidth={active ? 2.5 : 2} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
          <Link
            to="/dashboard"
            className={cn(
              'flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-colors',
              location.pathname === '/dashboard' ? 'text-accent' : 'text-muted-foreground'
            )}
          >
            <User className="w-5 h-5" strokeWidth={location.pathname === '/dashboard' ? 2.5 : 2} />
            <span className="text-[10px] font-medium">Me</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}