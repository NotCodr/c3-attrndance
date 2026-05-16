import React from 'react';
import { Link } from 'react-router-dom';
import { Users, Globe, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';

export default function ClubCard({ club, index = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.04 }}
    >
      <Link to={`/club/${club.id}`} className="group block">
        <div className="relative overflow-hidden rounded-2xl bg-card border border-border/60 hover:border-accent/40 hover:shadow-xl hover:shadow-accent/5 transition-all">
          <div className="relative h-32 overflow-hidden bg-gradient-to-br from-primary to-accent">
            {club.cover_url && (
              <img
                src={club.cover_url}
                alt={club.name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
            {club.international_friendly && (
              <Badge className="absolute top-3 right-3 bg-white/95 text-primary border-0 hover:bg-white">
                <Globe className="w-3 h-3 mr-1" /> Intl friendly
              </Badge>
            )}
          </div>
          <div className="p-5">
            <div className="flex items-start justify-between gap-3 mb-2">
              <h3 className="font-display text-lg font-semibold leading-tight tracking-tight">
                {club.name}
              </h3>
              {club.verified && (
                <CheckCircle2 className="w-4 h-4 text-accent flex-shrink-0 mt-1" />
              )}
            </div>
            <p className="text-sm text-muted-foreground line-clamp-2 mb-4 min-h-[40px]">
              {club.tagline || club.ai_summary || club.description}
            </p>
            <div className="flex items-center justify-between">
              <div className="flex flex-wrap gap-1.5">
                {club.categories?.slice(0, 2).map((cat) => (
                  <span
                    key={cat}
                    className="text-[10px] uppercase tracking-wider font-semibold text-accent bg-accent/10 px-2 py-1 rounded-full"
                  >
                    {cat}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="w-3.5 h-3.5" />
                {club.member_count || 0}
              </div>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}