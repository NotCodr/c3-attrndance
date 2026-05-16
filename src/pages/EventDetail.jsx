import React, { useState, useEffect } from 'react';
import { useParams, useOutletContext, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { Calendar, MapPin, Users, Clock, Globe, ArrowLeft, Heart, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export default function EventDetail() {
  const { id } = useParams();
  const { profile, setProfile } = useOutletContext() || {};
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rsvpd, setRsvpd] = useState(false);

  useEffect(() => {
    const load = async () => {
      const list = await base44.entities.Event.list();
      setEvent(list.find((e) => e.id === id));
      setLoading(false);
    };
    load();
  }, [id]);

  useEffect(() => {
    setRsvpd((profile?.rsvp_events || []).includes(id));
  }, [profile, id]);

  const toggleRsvp = async () => {
    if (!profile || !event) return;
    const current = profile.rsvp_events || [];
    const next = rsvpd ? current.filter((x) => x !== id) : [...current, id];
    setRsvpd(!rsvpd);
    try {
      const updated = await base44.entities.StudentProfile.update(profile.id, {
        rsvp_events: next,
      });
      if (setProfile) setProfile(updated);
      await base44.entities.Event.update(id, {
        rsvp_count: Math.max(0, (event.rsvp_count || 0) + (rsvpd ? -1 : 1)),
      });
      toast.success(rsvpd ? 'RSVP cancelled' : "You're going! 🎉");
    } catch (e) {
      setRsvpd(rsvpd);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="text-center py-24">
        <p className="text-muted-foreground">Event not found.</p>
        <Link to="/events" className="text-accent text-sm mt-2 inline-block">
          Back to events
        </Link>
      </div>
    );
  }

  const start = new Date(event.start_date);

  return (
    <div>
      <div className="relative h-72 md:h-96 bg-gradient-to-br from-primary via-accent to-primary overflow-hidden">
        {event.cover_url && (
          <img src={event.cover_url} alt={event.title} className="w-full h-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        <div className="absolute top-4 left-4 z-10">
          <Link to="/events">
            <Button variant="secondary" size="icon" className="rounded-full bg-white/90 backdrop-blur">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 -mt-24 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-3xl border border-border/60 p-6 md:p-10 shadow-xl shadow-black/5"
        >
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <p className="text-sm font-semibold text-accent uppercase tracking-wider">
              {event.club_name}
            </p>
            {event.international_friendly && (
              <Badge variant="outline" className="border-accent/30 text-accent">
                <Globe className="w-3 h-3 mr-1" /> Intl friendly
              </Badge>
            )}
          </div>
          <h1 className="font-display text-3xl md:text-5xl font-bold tracking-tight mb-6 text-balance">
            {event.title}
          </h1>

          {/* Quick facts */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <div className="flex items-start gap-3 p-4 rounded-2xl bg-secondary/50">
              <Calendar className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">When</p>
                <p className="text-sm font-medium">{format(start, 'EEE, MMM d')}</p>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {format(start, 'h:mm a')}
                </p>
              </div>
            </div>
            {event.location && (
              <div className="flex items-start gap-3 p-4 rounded-2xl bg-secondary/50">
                <MapPin className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Where</p>
                  <p className="text-sm font-medium">{event.location}</p>
                  {event.is_online && <p className="text-xs text-muted-foreground">Online event</p>}
                </div>
              </div>
            )}
            <div className="flex items-start gap-3 p-4 rounded-2xl bg-secondary/50">
              <Users className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Going</p>
                <p className="text-sm font-medium">{event.rsvp_count || 0} {event.capacity ? `of ${event.capacity}` : 'people'}</p>
                <p className="text-xs text-muted-foreground">{event.price || 'Free'}</p>
              </div>
            </div>
          </div>

          {/* RSVP */}
          <div className="flex flex-wrap gap-3 mb-8">
            <Button
              size="lg"
              onClick={toggleRsvp}
              className={`rounded-full flex-1 sm:flex-none ${
                rsvpd ? 'bg-secondary text-foreground hover:bg-secondary/70' : 'bg-primary hover:bg-primary/90'
              }`}
            >
              <Heart className={`w-4 h-4 mr-2 ${rsvpd ? 'fill-current' : ''}`} />
              {rsvpd ? "You're going" : "I'll be there"}
            </Button>
            {event.rsvp_url && (
              <a href={event.rsvp_url} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="lg" className="rounded-full">
                  <ExternalLink className="w-4 h-4 mr-2" /> External RSVP
                </Button>
              </a>
            )}
          </div>

          {/* Description */}
          {event.description && (
            <div>
              <h2 className="font-display text-xl font-bold mb-3">About this event</h2>
              <p className="text-foreground/80 leading-relaxed whitespace-pre-line">
                {event.description}
              </p>
            </div>
          )}

          {event.tags?.length > 0 && (
            <div className="mt-8 pt-6 border-t border-border/60 flex flex-wrap gap-2">
              {event.tags.map((t) => (
                <span key={t} className="text-xs px-3 py-1 rounded-full bg-secondary text-foreground/70">
                  #{t}
                </span>
              ))}
            </div>
          )}
        </motion.div>
      </div>
      <div className="h-16" />
    </div>
  );
}