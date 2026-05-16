import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { motion } from 'framer-motion';
import { Calendar, Loader2 } from 'lucide-react';
import EventCard from '@/components/shared/EventCard';
import EmptyState from '@/components/shared/EmptyState';
import { cn } from '@/lib/utils';

const FILTERS = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'this_week', label: 'This week' },
  { key: 'this_weekend', label: 'This weekend' },
  { key: 'free', label: 'Free only' },
  { key: 'international', label: 'Intl friendly' },
];

export default function Events() {
  const { profile } = useOutletContext() || {};
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState('upcoming');

  useEffect(() => {
    const load = async () => {
      const list = await base44.entities.Event.list('start_date', 200);
      const uni = profile?.university;
      const scoped = uni ? list.filter((e) => e.university === uni) : list;
      const upcoming = scoped.filter(
        (e) => new Date(e.start_date) > new Date(Date.now() - 1000 * 60 * 60 * 4)
      );
      setEvents(upcoming);
      setLoading(false);
    };
    load();
  }, [profile]);

  const now = new Date();
  const filtered = events.filter((e) => {
    const start = new Date(e.start_date);
    if (active === 'this_week') {
      const weekFromNow = new Date(now);
      weekFromNow.setDate(now.getDate() + 7);
      return start >= now && start <= weekFromNow;
    }
    if (active === 'this_weekend') {
      const day = now.getDay();
      const daysToSat = (6 - day + 7) % 7 || 7;
      const sat = new Date(now);
      sat.setDate(now.getDate() + daysToSat);
      sat.setHours(0, 0, 0, 0);
      const sunEnd = new Date(sat);
      sunEnd.setDate(sat.getDate() + 2);
      return start >= sat && start <= sunEnd;
    }
    if (active === 'free') return /free/i.test(e.price || '') || !e.price;
    if (active === 'international') return e.international_friendly;
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="font-display text-4xl md:text-5xl font-bold tracking-tight mb-3">
          Events
        </h1>
        <p className="text-muted-foreground text-balance">
          Everything happening at {profile?.university || 'your campus'} — workshops, parties, panels, and more.
        </p>
      </motion.div>

      <div className="flex gap-2 overflow-x-auto scrollbar-hide mb-8 -mx-4 px-4">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setActive(f.key)}
            className={cn(
              'px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all',
              active === f.key
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-foreground/70 hover:bg-secondary/70'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="No events match"
          description="Try a different filter."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((event, i) => (
            <EventCard key={event.id} event={event} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}