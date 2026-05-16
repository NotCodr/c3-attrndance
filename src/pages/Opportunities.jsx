import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { motion } from 'framer-motion';
import { Briefcase, Loader2 } from 'lucide-react';
import OpportunityCard from '@/components/shared/OpportunityCard';
import EmptyState from '@/components/shared/EmptyState';
import { cn } from '@/lib/utils';

const TYPES = ['All', 'internship', 'scholarship', 'competition', 'volunteer', 'research', 'leadership'];

export default function Opportunities() {
  const { profile } = useOutletContext() || {};
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState('All');

  useEffect(() => {
    const load = async () => {
      const list = await base44.entities.Opportunity.list('deadline', 200);
      const uni = profile?.university;
      const scoped = uni
        ? list.filter((o) => o.university === uni || o.university === 'Both')
        : list;
      setItems(scoped);
      setLoading(false);
    };
    load();
  }, [profile]);

  const filtered =
    active === 'All' ? items : items.filter((o) => o.type === active);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="font-display text-4xl md:text-5xl font-bold tracking-tight mb-3">
          Opportunities
        </h1>
        <p className="text-muted-foreground text-balance">
          Internships, scholarships, competitions — the stuff that changes trajectories.
        </p>
      </motion.div>

      <div className="flex gap-2 overflow-x-auto scrollbar-hide mb-8 -mx-4 px-4">
        {TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setActive(t)}
            className={cn(
              'px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap capitalize transition-all',
              active === t
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-foreground/70 hover:bg-secondary/70'
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="Nothing here yet"
          description="New opportunities drop weekly. Check back soon."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filtered.map((opp, i) => (
            <OpportunityCard key={opp.id} opportunity={opp} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}