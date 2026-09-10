import React, { useEffect } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { Plus, ArrowRight, Sparkles } from 'lucide-react';
import Logo from '@/components/Logo';

export default function Dashboard() {
  const { clubs } = useOutletContext() || { clubs: [] };
  const navigate = useNavigate();

  useEffect(() => {
    // Straight into the club when there's only one to choose from.
    if (clubs?.length === 1) navigate(`/c/${clubs[0].slug}`, { replace: true });
  }, [clubs, navigate]);

  if (!clubs) {
    return <div className="text-sm text-muted-foreground">loading…</div>;
  }

  if (clubs.length === 0) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center">
        <Logo size={88} className="mb-6" />
        <h1 className="font-display font-bold text-4xl mb-3">welcome to connect3</h1>
        <p className="text-muted-foreground mb-8 text-balance">
          you're not part of a club yet. create one to get started, or wait for an invite from a committee member.
        </p>
        <Link to="/onboard" className="c3-btn-primary text-base px-6 py-3">
          <Plus className="w-4 h-4" /> create a club
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-2">
        <Sparkles className="w-5 h-5 text-primary" />
        <p className="text-sm font-medium text-primary uppercase tracking-wider">your clubs</p>
      </div>
      <h1 className="font-display font-bold text-4xl mb-2">pick a club to manage</h1>
      <p className="text-muted-foreground mb-8">jump into events, attendance and grants.</p>
      <div className="space-y-3">
        {clubs.map((c) => (
          <Link key={c.id} to={`/c/${c.slug}`} className="block c3-card p-5 hover:-translate-y-0.5 transition-transform">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 h-12 rounded-2xl bg-primary/15 flex items-center justify-center font-display font-bold text-primary text-lg shrink-0">
                  {c.name?.[0]?.toUpperCase() || 'C'}
                </div>
                <div className="min-w-0">
                  <p className="font-display font-bold text-lg truncate">{c.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {c.university_name || 'University of Melbourne'} · <span className="c3-badge ml-1">{c.role}</span>
                  </p>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-muted-foreground shrink-0" />
            </div>
          </Link>
        ))}
        <Link to="/onboard" className="block c3-card-soft p-5 border-dashed hover:bg-secondary/40 transition">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Plus className="w-4 h-4" /> create another club
          </div>
        </Link>
      </div>
    </div>
  );
}