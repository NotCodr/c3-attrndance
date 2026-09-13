import React, { useEffect } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { ArrowRight, Plus } from 'lucide-react';
import InitialsAvatar from '@/components/InitialsAvatar';

export default function Dashboard() {
  const { clubs } = useOutletContext() || { clubs: [] };
  const navigate = useNavigate();

  useEffect(() => {
    // Straight into the club when there's only one to choose from.
    if (clubs?.length === 1) navigate(`/c/${clubs[0].slug}`, { replace: true });
  }, [clubs, navigate]);

  if (!clubs) {
    return <div className="text-sm text-[#4A4270]">loading…</div>;
  }

  if (clubs.length === 0) {
    return (
      <div className="mx-auto max-w-xl py-10 text-center">
        <img src="/brand/characters-cheers.webp" alt="" className="mx-auto mb-4 w-56" />
        <h1 className="mb-3 font-display text-4xl font-bold tracking-tight">Welcome to connect3</h1>
        <p className="mb-8 text-balance text-[#4A4270]">
          You're not part of a club yet. Start one, or wait for a committee member to invite you.
        </p>
        <Link to="/onboard" className="ink-btn ink-btn-primary px-6 py-3 text-base">
          <Plus className="h-4 w-4" strokeWidth={2.8} /> start a club
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 font-display text-4xl font-bold tracking-tight">Pick a club</h1>
      <p className="mb-8 text-[#4A4270]">Jump into events, the door and grants.</p>
      <div className="space-y-3.5">
        {clubs.map((c) => (
          <Link
            key={c.id}
            to={`/c/${c.slug}`}
            className="ink-card flex items-center justify-between gap-3 p-4 transition hover:-translate-y-0.5 hover:shadow-[0_6px_0_0_hsl(var(--c3-ink))] sm:p-5"
          >
            <span className="flex min-w-0 items-center gap-3.5">
              <InitialsAvatar name={c.name} src={c.logo_url} size={48} />
              <span className="min-w-0">
                <span className="block truncate font-display text-lg font-bold">{c.name}</span>
                <span className="mt-0.5 flex items-center gap-2 text-xs text-[#4A4270]">
                  {c.university_name || 'University of Melbourne'}
                  <span className="rounded-full bg-[#EDE7FF] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#6D4FD8]">{c.role}</span>
                </span>
              </span>
            </span>
            <ArrowRight className="h-5 w-5 shrink-0" />
          </Link>
        ))}
        <Link
          to="/onboard"
          className="flex items-center gap-2 rounded-[22px] border-2 border-dashed border-[#B9B0DA] p-5 text-sm font-semibold text-[#4A4270] transition hover:border-[hsl(var(--c3-ink))] hover:bg-white/60"
        >
          <Plus className="h-4 w-4" /> start another club
        </Link>
      </div>
    </div>
  );
}
