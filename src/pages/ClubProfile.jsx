import React, { useState, useEffect } from 'react';
import { useParams, useOutletContext, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { motion } from 'framer-motion';
import { Users, Globe, Instagram, Mail, ExternalLink, Heart, CheckCircle2, Sparkles, ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import EventCard from '@/components/shared/EventCard';
import { toast } from 'sonner';

export default function ClubProfile() {
  const { id } = useParams();
  const { profile, setProfile } = useOutletContext() || {};
  const [club, setClub] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [c, e] = await Promise.all([
        base44.entities.Club.list().then((list) => list.find((x) => x.id === id)),
        base44.entities.Event.filter({ club_id: id }, 'start_date', 20),
      ]);
      setClub(c);
      setEvents(e.filter((ev) => new Date(ev.start_date) > new Date(Date.now() - 1000 * 60 * 60 * 24)));
      setLoading(false);
    };
    load();
  }, [id]);

  useEffect(() => {
    setFollowing((profile?.followed_clubs || []).includes(id));
  }, [profile, id]);

  const toggleFollow = async () => {
    if (!profile) return;
    const current = profile.followed_clubs || [];
    const next = following ? current.filter((x) => x !== id) : [...current, id];
    setFollowing(!following);
    try {
      const updated = await base44.entities.StudentProfile.update(profile.id, {
        followed_clubs: next,
      });
      if (setProfile) setProfile(updated);
      // bump follower count
      await base44.entities.Club.update(id, {
        follower_count: Math.max(0, (club.follower_count || 0) + (following ? -1 : 1)),
      });
      toast.success(following ? `Unfollowed ${club.name}` : `Following ${club.name}`);
    } catch (e) {
      setFollowing(following);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!club) {
    return (
      <div className="text-center py-24">
        <p className="text-muted-foreground">Club not found.</p>
        <Link to="/discover" className="text-accent text-sm mt-2 inline-block">
          Back to discover
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Hero */}
      <div className="relative h-64 md:h-80 bg-gradient-to-br from-primary via-accent to-primary overflow-hidden">
        {club.cover_url && (
          <img src={club.cover_url} alt={club.name} className="w-full h-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />
        <div className="absolute top-4 left-4 z-10">
          <Link to="/discover">
            <Button variant="secondary" size="icon" className="rounded-full bg-white/90 backdrop-blur">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 -mt-16 md:-mt-20 relative z-10">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          {/* Header card */}
          <div className="bg-card rounded-3xl border border-border/60 p-6 md:p-8 shadow-xl shadow-black/5">
            <div className="flex flex-col md:flex-row md:items-start gap-6">
              <div className="w-24 h-24 md:w-28 md:h-28 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-display text-4xl font-bold flex-shrink-0 overflow-hidden">
                {club.logo_url ? (
                  <img src={club.logo_url} alt={club.name} className="w-full h-full object-cover" />
                ) : (
                  club.name[0]
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
                    {club.name}
                  </h1>
                  {club.verified && <CheckCircle2 className="w-5 h-5 text-accent" />}
                </div>
                {club.tagline && (
                  <p className="text-lg text-muted-foreground mb-3 text-balance">{club.tagline}</p>
                )}
                <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1.5">
                    <Users className="w-4 h-4" /> {club.member_count || 0} members
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Heart className="w-4 h-4" /> {club.follower_count || 0} followers
                  </span>
                  {club.international_friendly && (
                    <Badge variant="outline" className="border-accent/30 text-accent">
                      <Globe className="w-3 h-3 mr-1" /> International friendly
                    </Badge>
                  )}
                </div>
              </div>
              <Button
                onClick={toggleFollow}
                size="lg"
                className={`rounded-full ${
                  following ? 'bg-secondary text-foreground hover:bg-secondary/70' : 'bg-primary hover:bg-primary/90'
                }`}
              >
                <Heart className={`w-4 h-4 mr-2 ${following ? 'fill-current' : ''}`} />
                {following ? 'Following' : 'Follow'}
              </Button>
            </div>

            {/* Categories */}
            {club.categories?.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-6 pt-6 border-t border-border/60">
                {club.categories.map((cat) => (
                  <span
                    key={cat}
                    className="text-xs uppercase tracking-wider font-semibold text-accent bg-accent/10 px-3 py-1.5 rounded-full"
                  >
                    {cat}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* AI summary */}
          {club.ai_summary && (
            <div className="mt-6 p-6 rounded-2xl bg-accent/5 border border-accent/20">
              <div className="flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-accent mb-2">
                    The vibe
                  </p>
                  <p className="text-sm md:text-base leading-relaxed text-balance">
                    {club.ai_summary}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Description */}
          {club.description && (
            <div className="mt-8">
              <h2 className="font-display text-2xl font-bold mb-3">About</h2>
              <p className="text-foreground/80 leading-relaxed whitespace-pre-line">
                {club.description}
              </p>
            </div>
          )}

          {/* Meta */}
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-3">
            {club.meeting_info && (
              <div className="p-4 rounded-2xl bg-secondary/50">
                <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-1">Meets</p>
                <p className="text-sm">{club.meeting_info}</p>
              </div>
            )}
            {club.membership_fee && (
              <div className="p-4 rounded-2xl bg-secondary/50">
                <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-1">Membership</p>
                <p className="text-sm">{club.membership_fee}</p>
              </div>
            )}
          </div>

          {/* Links */}
          <div className="mt-6 flex flex-wrap gap-3">
            {club.instagram && (
              <a
                href={`https://instagram.com/${club.instagram.replace('@', '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-full border border-border hover:border-accent/40 transition-colors"
              >
                <Instagram className="w-4 h-4" /> {club.instagram}
              </a>
            )}
            {club.website && (
              <a
                href={club.website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-full border border-border hover:border-accent/40 transition-colors"
              >
                <ExternalLink className="w-4 h-4" /> Website
              </a>
            )}
            {club.email && (
              <a
                href={`mailto:${club.email}`}
                className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-full border border-border hover:border-accent/40 transition-colors"
              >
                <Mail className="w-4 h-4" /> Email
              </a>
            )}
          </div>

          {/* Upcoming events */}
          {events.length > 0 && (
            <div className="mt-12 mb-16">
              <h2 className="font-display text-2xl font-bold mb-6">Upcoming events</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {events.map((event, i) => (
                  <EventCard key={event.id} event={event} index={i} />
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}