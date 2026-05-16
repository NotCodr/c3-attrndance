import React from 'react';
import { Link } from 'react-router-dom';
import { format, isPast, isToday, isTomorrow } from 'date-fns';
import { MapPin, Users, Clock, Globe } from 'lucide-react';
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';

function formatWhen(date) {
  const d = new Date(date);
  if (isToday(d)) return `Today · ${format(d, 'h:mm a')}`;
  if (isTomorrow(d)) return `Tomorrow · ${format(d, 'h:mm a')}`;
  return format(d, "EEE, MMM d · h:mm a");
}

export default function EventCard({ event, index = 0, variant = 'default' }) {
  const past = isPast(new Date(event.end_date || event.start_date));
  const startDate = new Date(event.start_date);

  if (variant === 'compact') {
    return (
      <Link to={`/event/${event.id}`} className="group block">
        <div className="flex gap-4 p-3 rounded-2xl hover:bg-secondary/60 transition-colors">
          <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-accent to-primary flex flex-col items-center justify-center text-white flex-shrink-0">
            <span className="text-[10px] uppercase font-semibold tracking-wider opacity-80">
              {format(startDate, 'MMM')}
            </span>
            <span className="text-2xl font-bold leading-none">{format(startDate, 'd')}</span>
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold leading-tight truncate">{event.title}</h4>
            <p className="text-xs text-muted-foreground mt-1 truncate">{event.club_name}</p>
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {format(startDate, 'h:mm a')}
              {event.location && <><span>·</span><span className="truncate">{event.location}</span></>}
            </p>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.04 }}
    >
      <Link to={`/event/${event.id}`} className="group block">
        <div className="relative overflow-hidden rounded-2xl bg-card border border-border/60 hover:border-accent/40 hover:shadow-xl hover:shadow-accent/5 transition-all">
          <div className="relative h-40 overflow-hidden bg-gradient-to-br from-primary via-accent to-primary">
            {event.cover_url && (
              <img
                src={event.cover_url}
                alt={event.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
            <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-2">
              <div className="bg-white/95 backdrop-blur rounded-xl px-3 py-1.5 flex items-center gap-2">
                <span className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground">
                  {format(startDate, 'MMM')}
                </span>
                <span className="text-lg font-bold text-primary leading-none">
                  {format(startDate, 'd')}
                </span>
              </div>
              {event.international_friendly && (
                <Badge className="bg-white/95 text-primary border-0">
                  <Globe className="w-3 h-3 mr-1" /> Intl
                </Badge>
              )}
            </div>
          </div>
          <div className="p-5">
            <p className="text-xs font-semibold text-accent uppercase tracking-wider mb-2">
              {event.club_name}
            </p>
            <h3 className="font-display text-lg font-semibold leading-tight tracking-tight mb-3 line-clamp-2">
              {event.title}
            </h3>
            <div className="space-y-1.5 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                <span className={past ? 'line-through' : ''}>{formatWhen(event.start_date)}</span>
              </div>
              {event.location && (
                <div className="flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">{event.location}</span>
                </div>
              )}
              {event.rsvp_count > 0 && (
                <div className="flex items-center gap-2">
                  <Users className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{event.rsvp_count} going</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}