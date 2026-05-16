import React, { useState, useEffect } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { motion } from 'framer-motion';
import { Sparkles, TrendingUp, Loader2 } from 'lucide-react';
import ClubCard from '@/components/shared/ClubCard';
import EventCard from '@/components/shared/EventCard';
import SectionHeader from '@/components/shared/SectionHeader';
import { Button } from '@/components/ui/button';

export default function Feed() {
  const { profile } = useOutletContext() || {};
  const [clubs, setClubs] = useState([]);
  const [events, setEvents] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [welcomeMessage, setWelcomeMessage] = useState('');

  useEffect(() => {
    const load = async () => {
      const [clubList, eventList] = await Promise.all([
        base44.entities.Club.list('-created_date', 50),
        base44.entities.Event.filter({}, '-start_date', 50),
      ]);
      const uni = profile?.university;
      const filteredClubs = uni ? clubList.filter((c) => c.university === uni) : clubList;
      const filteredEvents = uni ? eventList.filter((e) => e.university === uni) : eventList;
      setClubs(filteredClubs);
      setEvents(
        filteredEvents
          .filter((e) => new Date(e.start_date) > new Date(Date.now() - 1000 * 60 * 60 * 24))
          .sort((a, b) => new Date(a.start_date) - new Date(b.start_date))
      );
      setLoading(false);

      // AI recommendations
      if (profile && filteredClubs.length > 0) {
        generateRecommendations(profile, filteredClubs, filteredEvents);
      }
    };
    if (profile) load();
  }, [profile]);

  const generateRecommendations = async (prof, clubList, eventList) => {
    setAiLoading(true);
    try {
      const clubData = clubList.slice(0, 30).map((c) => ({
        id: c.id,
        name: c.name,
        tagline: c.tagline,
        categories: c.categories,
        tags: c.tags,
        international_friendly: c.international_friendly,
      }));

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `You're matching a student to clubs on Connect3.

Student profile:
- Name: ${prof.display_name}
- Year: ${prof.year_of_study}
- International: ${prof.international}
- Interests: ${(prof.interests || []).join(', ')}
- Goals: ${(prof.goals || []).join(', ')}
- Vibe: ${(prof.vibe_tags || []).join(', ')}

Available clubs (JSON):
${JSON.stringify(clubData)}

Pick the 6 best-fit clubs for this student. Be thoughtful — match on interests, goals, and vibe. If they're international, prioritize international_friendly clubs. Also write a warm, personalized 1-sentence welcome message that references something specific about their interests.`,
        response_json_schema: {
          type: 'object',
          properties: {
            welcome_message: { type: 'string' },
            recommended_club_ids: { type: 'array', items: { type: 'string' } },
          },
        },
      });

      setWelcomeMessage(result?.welcome_message || '');
      const ids = result?.recommended_club_ids || [];
      const recs = ids.map((id) => clubList.find((c) => c.id === id)).filter(Boolean);
      setRecommendations(recs);
    } catch (e) {
      console.error(e);
    }
    setAiLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const upcomingEvents = events.slice(0, 6);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
      {/* Hero greeting */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-12 md:mb-16"
      >
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-accent" />
          <span className="text-xs font-semibold uppercase tracking-wider text-accent">
            Your campus, curated
          </span>
        </div>
        <h1 className="font-display text-4xl md:text-6xl font-bold tracking-tight text-balance mb-4">
          Hey {profile?.display_name?.split(' ')[0] || 'there'},
          <br />
          <span className="text-accent">here's what's good.</span>
        </h1>
        {aiLoading && !welcomeMessage ? (
          <p className="text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> AI is tuning your feed…
          </p>
        ) : welcomeMessage ? (
          <p className="text-lg text-muted-foreground max-w-2xl text-balance">{welcomeMessage}</p>
        ) : null}
      </motion.div>

      {/* AI picks */}
      {recommendations.length > 0 && (
        <section className="mb-16">
          <SectionHeader
            title="Picked for you"
            subtitle="AI-matched to your interests, goals, and vibe."
            action="Discover more"
            actionTo="/discover"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {recommendations.slice(0, 6).map((club, i) => (
              <ClubCard key={club.id} club={club} index={i} />
            ))}
          </div>
        </section>
      )}

      {/* Upcoming events */}
      {upcomingEvents.length > 0 && (
        <section className="mb-16">
          <SectionHeader
            title="Happening soon"
            subtitle="Events worth showing up for."
            action="See all events"
            actionTo="/events"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {upcomingEvents.map((event, i) => (
              <EventCard key={event.id} event={event} index={i} />
            ))}
          </div>
        </section>
      )}

      {/* Trending clubs */}
      <section className="mb-16">
        <SectionHeader
          title="Trending on campus"
          subtitle={`Most-followed clubs at ${profile?.university || 'your uni'}.`}
          action="Browse all"
          actionTo="/discover"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[...clubs]
            .sort((a, b) => (b.follower_count || 0) - (a.follower_count || 0))
            .slice(0, 6)
            .map((club, i) => (
              <ClubCard key={club.id} club={club} index={i} />
            ))}
        </div>
      </section>

      {/* CTA */}
      <div className="rounded-3xl bg-primary text-primary-foreground p-8 md:p-12 relative overflow-hidden">
        <div className="absolute inset-0 gradient-mesh opacity-30" />
        <div className="relative max-w-2xl">
          <TrendingUp className="w-8 h-8 mb-4 text-accent" />
          <h3 className="font-display text-3xl md:text-4xl font-bold tracking-tight mb-3 text-balance">
            Search the whole campus with one question.
          </h3>
          <p className="text-primary-foreground/70 mb-6 text-balance">
            Try "clubs for shy international first-years" or "free events this weekend".
          </p>
          <Link to="/discover">
            <Button size="lg" className="bg-accent hover:bg-accent/90 text-white rounded-full">
              Try AI search
              <Sparkles className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}