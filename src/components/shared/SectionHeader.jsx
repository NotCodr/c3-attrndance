import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

export default function SectionHeader({ title, subtitle, action, actionTo }) {
  return (
    <div className="flex items-end justify-between mb-6">
      <div>
        <h2 className="font-display text-2xl md:text-3xl font-bold tracking-tight">{title}</h2>
        {subtitle && (
          <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
        )}
      </div>
      {action && actionTo && (
        <Link
          to={actionTo}
          className="text-sm font-medium text-accent hover:text-accent/80 flex items-center gap-1 flex-shrink-0"
        >
          {action}
          <ArrowRight className="w-4 h-4" />
        </Link>
      )}
    </div>
  );
}