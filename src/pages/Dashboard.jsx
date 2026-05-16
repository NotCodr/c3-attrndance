import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { Plus, ArrowRight } from 'lucide-react';
import { listMyClubs } from '@/lib/clubs';

export default function Dashboard() {
  const { user } = useOutletContext() || {};
  const navigate = useNavigate();
  const [clubs, setClubs] = useState(null);

  useEffect(() => {
    (async () => {
      if (!user?.email) return;
      const cs = await listMyClubs(user.email);
      setClubs(cs);
      if (cs.length === 1) navigate(`/c/${cs[0].slug}`, { replace: true });
    })();
  }, [user]);

  if (clubs === null) {
    return <div className="text-sm text-muted-foreground">loading…</div>;
  }

  if (clubs.length === 0) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center">
        <h1 className="text-2xl font-medium mb-2">Welcome to Connect3</h1>
        <p className="text-sm text-muted-foreground mb-8">You're not part of a club yet. Create one to get started, or wait for an invite from a committee member.</p>
        <Link to="/onboard" className="c3-btn-primary">
          <Plus className="w-4 h-4" /> create a club
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-medium mb-1">your clubs</h1>
      <p className="text-sm text-muted-foreground mb-6">Pick a club to manage.</p>
      <div className="space-y-2">
        {clubs.map((c) => (
          <Link key={c.id} to={`/c/${c.slug}`} className="block c3-card p-4 hover:bg-secondary/30 transition">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{c.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{c.university_name || 'University of Melbourne'} · role: {c.role}</p>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
            </div>
          </Link>
        ))}
        <Link to="/onboard" className="block c3-card p-4 border-dashed hover:bg-secondary/30 transition">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Plus className="w-4 h-4" /> create another club
          </div>
        </Link>
      </div>
    </div>
  );
}