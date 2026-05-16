import React, { useState, useEffect } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { motion } from 'framer-motion';
import { Heart, Calendar, Sparkles, Settings, GraduationCap, Globe, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ClubCard from '@/components/shared/ClubCard';
import EventCard from '@/components/shared/EventCard';
import EmptyState from '@/components/shared/EmptyState';

export default function Dashboard() {
  const { profile } = useOutletContext() || {};
  const [followed, setFollowed] = useState([]);
  const [rsvp, setRsvp] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!profile) return;
      const [clubs, events] = await Promise.all([
        base44.entities.Club.list(),
        base44.entities.Event.list(),
      ]);
      setFollowed(clubs.filter((c) => (profile.followed_clubs || []).includes(c.id)));
      setRsvp(
        events
          .filter((e) => (profile.rsvp_events || []).includes(e.id))
          .sort((a, b) => new Date(a.start_date) - new Date(b.start_date))
      );
      setLoading(false);
    };
    load();
  }, [profile]);

  if (!profile) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
      {/* Profile header */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-12">
        <div className="flex flex-col md:flex-row md:items-center gap-6">
          <div className="w-20 h-20 md:w-24 md:h-24 rounded-2xl bg-gradient-to-br from-accent to-primary flex items-center justify-center text-white font-display text-3xl font-bold">
            {profile.display_name?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="flex-1">
            <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight mb-2">
              {profile.display_name}
            </h1>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <GraduationCap className="w-4 h-4" /> {profile.year_of_study} · {profile.university}
              </span>
              {profile.international && (
                <span className="flex items-center gap-1.5 text-accent">
                  <Globe className="w-4 h-4" /> International
                </span>
              )}
            </div>
          </div>
          <Link to="/onboarding">
            <Button variant="outline" className="rounded-full">
              <RefreshCw className="w-4 h-4 mr-2" /> Redo quiz
            </Button>
          </Link>
        </div>

        {/* Vibe tags */}
        {profile.vibe_tags?.length > 0 && (
          <div className="mt-6 p-5 rounded-2xl bg-accent/5 border border-accent/20">
            <div className="flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-accent mb-2">
                  Your vibe
                </p>
                <div className="flex flex-wrap gap-2">
                  {profile.vibe_tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-sm px-3 py-1 rounded-full bg-white border border-accent/20 font-medium"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </motion.div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* RSVP'd events */}
          <section className="mb-16">
            <h2 className="font-display text-2xl md:text-3xl font-bold tracking-tight mb-6">
              Your events
            </h2>
            {rsvp.length === 0 ? (
              <EmptyState
                icon={Calendar}
                title="No RSVPs yet"
                description="Find events you'd love and tap 'I'll be there'."
                action={
                  <Link to="/events">
                    <Button className="rounded-full">Browse events</Button>
                  </Link>
                }
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {rsvp.map((event, i) => (
                  <EventCard key={event.id} event={event} index={i} />
                ))}
              </div>
            )}
          </section>

          {/* Followed clubs */}
          <section>
            <h2 className="font-display text-2xl md:text-3xl font-bold tracking-tight mb-6">
              Clubs you follow
            </h2>
            {followed.length === 0 ? (
              <EmptyState
                icon={Heart}
                title="No clubs followed yet"
                description="Follow clubs to keep up with their events and updates."
                action={
                  <Link to="/discover">
                    <Button className="rounded-full">Discover clubs</Button>
                  </Link>
                }
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {followed.map((club, i) => (
                  <ClubCard key={club.id} club={club} index={i} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}