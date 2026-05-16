import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { motion } from 'framer-motion';
import { Search, Sparkles, Loader2, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import ClubCard from '@/components/shared/ClubCard';
import EmptyState from '@/components/shared/EmptyState';
import { cn } from '@/lib/utils';

const SUGGESTIONS = [
  'Clubs for shy international first-years',
  'Where do I meet startup people?',
  'Creative communities with no audition',
  'Sports clubs that are actually beginner-friendly',
  'Things to join if I love debate and politics',
];

const CATEGORY_FILTERS = [
  'All', 'Tech', 'Arts', 'Sports', 'Cultural', 'Academic', 'Social', 'Political', 'Wellness',
];

export default function Discover() {
  const { profile } = useOutletContext() || {};
  const [clubs, setClubs] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [aiSearching, setAiSearching] = useState(false);
  const [aiAnswer, setAiAnswer] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const list = await base44.entities.Club.list('-follower_count', 100);
      const uni = profile?.university;
      const scoped = uni ? list.filter((c) => c.university === uni) : list;
      setClubs(scoped);
      setFiltered(scoped);
      setLoading(false);
    };
    load();
  }, [profile]);

  useEffect(() => {
    if (aiAnswer) return; // AI results override category filter
    let result = clubs;
    if (activeCategory !== 'All') {
      result = result.filter((c) =>
        c.categories?.some((cat) => cat.toLowerCase() === activeCategory.toLowerCase())
      );
    }
    if (query.trim() && !aiSearching) {
      const q = query.toLowerCase();
      result = result.filter(
        (c) =>
          c.name?.toLowerCase().includes(q) ||
          c.tagline?.toLowerCase().includes(q) ||
          c.description?.toLowerCase().includes(q) ||
          c.categories?.some((cat) => cat.toLowerCase().includes(q)) ||
          c.tags?.some((t) => t.toLowerCase().includes(q))
      );
    }
    setFiltered(result);
  }, [clubs, activeCategory, query, aiAnswer, aiSearching]);

  const runAiSearch = async (q) => {
    if (!q.trim()) return;
    setAiSearching(true);
    setAiAnswer(null);
    try {
      const clubData = clubs.map((c) => ({
        id: c.id,
        name: c.name,
        tagline: c.tagline,
        description: c.description?.slice(0, 200),
        categories: c.categories,
        tags: c.tags,
        international_friendly: c.international_friendly,
      }));

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `You're Connect3's AI search. A student asks: "${q}"

Student context: ${profile?.international ? 'international ' : ''}${profile?.year_of_study} at ${profile?.university}, into ${(profile?.interests || []).join(', ')}.

Available clubs:
${JSON.stringify(clubData)}

Return the 8 best matching club IDs (most relevant first) and a short, friendly 1-2 sentence answer explaining your picks. Be conversational, like a thoughtful friend recommending things.`,
        response_json_schema: {
          type: 'object',
          properties: {
            answer: { type: 'string' },
            club_ids: { type: 'array', items: { type: 'string' } },
          },
        },
      });

      const ids = result?.club_ids || [];
      const matched = ids.map((id) => clubs.find((c) => c.id === id)).filter(Boolean);
      setFiltered(matched);
      setAiAnswer(result?.answer || '');
    } catch (e) {
      console.error(e);
    }
    setAiSearching(false);
  };

  const clearAi = () => {
    setAiAnswer(null);
    setQuery('');
    setFiltered(clubs);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-accent" />
          <span className="text-xs font-semibold uppercase tracking-wider text-accent">
            AI-powered search
          </span>
        </div>
        <h1 className="font-display text-4xl md:text-5xl font-bold tracking-tight mb-3 text-balance">
          Ask anything. <span className="text-muted-foreground">Find your people.</span>
        </h1>
        <p className="text-muted-foreground mb-8 text-balance">
          Search by vibe, by goal, by feeling. Our AI gets it.
        </p>
      </motion.div>

      {/* Search box */}
      <div className="relative mb-4">
        <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && runAiSearch(query)}
          placeholder="Try: clubs for international students who love photography…"
          className="h-16 pl-14 pr-32 text-base rounded-2xl border-2 focus-visible:ring-accent"
        />
        <Button
          onClick={() => runAiSearch(query)}
          disabled={!query.trim() || aiSearching}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl bg-primary hover:bg-primary/90"
        >
          {aiSearching ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <><Sparkles className="w-4 h-4 mr-1.5" /> Ask AI</>
          )}
        </Button>
      </div>

      {/* Suggestions */}
      {!aiAnswer && !query && (
        <div className="flex flex-wrap gap-2 mb-8">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => {
                setQuery(s);
                runAiSearch(s);
              }}
              className="text-xs px-3 py-1.5 rounded-full bg-secondary hover:bg-secondary/70 text-foreground/80 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* AI answer */}
      {aiAnswer && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 p-5 rounded-2xl bg-primary text-primary-foreground relative"
        >
          <button
            onClick={clearAi}
            className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-start gap-3 pr-8">
            <Sparkles className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
            <p className="text-sm md:text-base leading-relaxed">{aiAnswer}</p>
          </div>
        </motion.div>
      )}

      {/* Category filters */}
      {!aiAnswer && (
        <div className="flex gap-2 overflow-x-auto scrollbar-hide mb-8 -mx-4 px-4">
          {CATEGORY_FILTERS.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={cn(
                'px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all',
                activeCategory === cat
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-foreground/70 hover:bg-secondary/70'
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Results */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No clubs match that"
          description="Try a different vibe or clear filters."
          action={
            <Button variant="outline" onClick={clearAi}>
              Clear search
            </Button>
          }
        />
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-4">
            {filtered.length} {filtered.length === 1 ? 'club' : 'clubs'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((club, i) => (
              <ClubCard key={club.id} club={club} index={i} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}