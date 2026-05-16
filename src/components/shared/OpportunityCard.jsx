import React from 'react';
import { format, differenceInDays } from 'date-fns';
import { Calendar, MapPin, ExternalLink, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';

const typeColors = {
  internship: 'bg-blue-50 text-blue-700 border-blue-200',
  scholarship: 'bg-purple-50 text-purple-700 border-purple-200',
  competition: 'bg-amber-50 text-amber-700 border-amber-200',
  volunteer: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  research: 'bg-rose-50 text-rose-700 border-rose-200',
  leadership: 'bg-indigo-50 text-indigo-700 border-indigo-200',
};

export default function OpportunityCard({ opportunity, index = 0 }) {
  const daysLeft = opportunity.deadline
    ? differenceInDays(new Date(opportunity.deadline), new Date())
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.04 }}
    >
      <a
        href={opportunity.apply_url || '#'}
        target="_blank"
        rel="noopener noreferrer"
        className="group block"
      >
        <div className="relative rounded-2xl bg-card border border-border/60 hover:border-accent/40 hover:shadow-xl hover:shadow-accent/5 transition-all p-6">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="flex-1 min-w-0">
              <Badge
                variant="outline"
                className={`${typeColors[opportunity.type] || ''} text-[10px] uppercase tracking-wider font-semibold border mb-3`}
              >
                {opportunity.type}
              </Badge>
              <h3 className="font-display text-xl font-semibold leading-tight tracking-tight mb-1">
                {opportunity.title}
              </h3>
              <p className="text-sm text-muted-foreground">{opportunity.organization}</p>
            </div>
            <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-accent transition-colors flex-shrink-0" />
          </div>

          <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
            {opportunity.description}
          </p>

          <div className="flex items-center justify-between flex-wrap gap-2 pt-3 border-t border-border/60">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {opportunity.deadline && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {format(new Date(opportunity.deadline), 'MMM d')}
                </span>
              )}
              {opportunity.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  {opportunity.location}
                </span>
              )}
            </div>
            {daysLeft !== null && daysLeft >= 0 && (
              <span
                className={`text-xs font-semibold ${
                  daysLeft <= 7 ? 'text-destructive' : 'text-accent'
                }`}
              >
                {daysLeft === 0 ? 'Closes today' : `${daysLeft}d left`}
              </span>
            )}
          </div>

          {opportunity.stipend && (
            <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-accent">
              <Sparkles className="w-3 h-3" />
              {opportunity.stipend}
            </div>
          )}
        </div>
      </a>
    </motion.div>
  );
}