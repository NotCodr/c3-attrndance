import React, { useState, useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { MapPin, Loader2, Calendar, Users, Building2 } from 'lucide-react';
import CampusMap, { categoryColors, EMOJI } from '@/components/shared/CampusMap';
import { cn } from '@/lib/utils';

// Campus centers
const CAMPUSES = {
  UMelb: { center: [-37.7984, 144.9614], name: 'Parkville Campus' },
  UWA: { center: [-31.9806, 115.8175], name: 'Crawley Campus' },
};

// Student hubs (manually placed near each campus center with small offsets)
const HUBS = {
  UMelb: [
    { id: 'hub-umelb-1', title: 'Union House', subtitle: 'Main student hub', location: 'Union House', lat: -37.7975, lng: 144.9610 },
    { id: 'hub-umelb-2', title: 'South Lawn', subtitle: 'Outdoor gathering space', location: 'South Lawn', lat: -37.7972, lng: 144.9605 },
    { id: 'hub-umelb-3', title: 'Doug McDonell Bldg', subtitle: 'CS & Engineering hub', location: 'Doug McDonell', lat: -37.7986, lng: 144.9637 },
    { id: 'hub-umelb-4', title: 'Old Arts', subtitle: 'Humanities meeting point', location: 'Old Arts', lat: -37.7966, lng: 144.9598 },
    { id: 'hub-umelb-5', title: 'North Court', subtitle: 'Wellness & outdoor space', location: 'North Court', lat: -37.7962, lng: 144.9617 },
    { id: 'hub-umelb-6', title: 'Spot Building', subtitle: 'Business & startup hub', location: 'Spot', lat: -37.7997, lng: 144.9594 },
  ],
  UWA: [
    { id: 'hub-uwa-1', title: 'Guild Village', subtitle: 'Main student hub', location: 'Guild', lat: -31.9803, lng: 115.8181 },
    { id: 'hub-uwa-2', title: 'Reid Library', subtitle: 'Study & event space', location: 'Reid Library', lat: -31.9812, lng: 115.8170 },
    { id: 'hub-uwa-3', title: 'Oak Lawn', subtitle: 'Outdoor gathering', location: 'Oak Lawn', lat: -31.9795, lng: 115.8175 },
    { id: 'hub-uwa-4', title: 'Octagon Theatre', subtitle: 'Performance venue', location: 'Octagon', lat: -31.9799, lng: 115.8189 },
    { id: 'hub-uwa-5', title: 'Business School', subtitle: 'Business hub', location: 'Business School', lat: -31.9819, lng: 115.8190 },
    { id: 'hub-uwa-6', title: 'Dolphin Theatre', subtitle: 'Drama society home', location: 'Dolphin Theatre', lat: -31.9801, lng: 115.8195 },
  ],
};

// Deterministic small offset based on event id, so pins don't collide on same building
function hashOffset(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const a = ((h & 0xff) / 255 - 0.5) * 0.002;
  const b = (((h >> 8) & 0xff) / 255 - 0.5) * 0.002;
  return [a, b];
}

// Match a location string to a known building → coords
function locationToCoords(location, university) {
  if (!location) return null;
  const hubs = HUBS[university] || [];
  const loc = location.toLowerCase();
  const match = hubs.find((h) =>
    loc.includes(h.location.toLowerCase()) ||
    loc.includes(h.title.toLowerCase())
  );
  if (match) return [match.lat, match.lng];
  // Off-campus events: skip
  if (loc.includes('scarborough') || loc.includes('yarra') || loc.includes('online')) return null;
  // Default: campus center
  return CAMPUSES[university]?.center || null;
}

const CATEGORY_FILTERS = [
  { key: 'All', label: 'All' },
  { key: 'Hub', label: 'Student Hubs' },
  { key: 'Tech', label: 'Tech' },
  { key: 'Arts', label: 'Arts' },
  { key: 'Sports', label: 'Sports' },
  { key: 'Cultural', label: 'Cultural' },
  { key: 'Academic', label: 'Academic' },
  { key: 'Social', label: 'Social' },
  { key: 'Wellness', label: 'Wellness' },
  { key: 'Political', label: 'Political' },
];

export default function MapPage() {
  const { profile } = useOutletContext() || {};
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('All');

  const university = profile?.university || 'UMelb';
  const campus = CAMPUSES[university];

  useEffect(() => {
    const load = async () => {
      const list = await base44.entities.Event.list('start_date', 200);
      const upcoming = list.filter(
        (e) =>
          e.university === university &&
          new Date(e.start_date) > new Date(Date.now() - 1000 * 60 * 60 * 4)
      );
      setEvents(upcoming);
      setLoading(false);
    };
    load();
  }, [university]);

  const allPins = useMemo(() => {
    const hubPins = (HUBS[university] || []).map((h) => ({
      ...h,
      kind: 'Student Hub',
      category: 'Hub',
    }));

    const eventPins = events
      .map((e) => {
        const coords = locationToCoords(e.location, university);
        if (!coords) return null;
        const [oLat, oLng] = hashOffset(e.id);
        const cat = e.categories?.[0] || 'Event';
        return {
          id: e.id,
          title: e.title,
          subtitle: `${e.club_name} · ${format(new Date(e.start_date), 'MMM d, h:mm a')}`,
          location: e.location,
          lat: coords[0] + oLat,
          lng: coords[1] + oLng,
          kind: 'Event',
          category: cat,
          link: `/event/${e.id}`,
        };
      })
      .filter(Boolean);

    return [...hubPins, ...eventPins];
  }, [events, university]);

  const filteredPins = useMemo(() => {
    if (activeCategory === 'All') return allPins;
    if (activeCategory === 'Hub') return allPins.filter((p) => p.category === 'Hub');
    return allPins.filter((p) => p.category === activeCategory);
  }, [allPins, activeCategory]);

  const hubCount = allPins.filter((p) => p.category === 'Hub').length;
  const eventCount = allPins.length - hubCount;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <MapPin className="w-4 h-4 text-accent" />
          <span className="text-xs font-semibold uppercase tracking-wider text-accent">
            {campus?.name}
          </span>
        </div>
        <h1 className="font-display text-4xl md:text-5xl font-bold tracking-tight mb-3 text-balance">
          Campus map
        </h1>
        <p className="text-muted-foreground text-balance">
          See where club life is happening — events, student hubs, and meeting points.
        </p>
      </motion.div>

      {/* Stats */}
      <div className="flex gap-3 mb-6">
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-secondary text-sm">
          <Building2 className="w-4 h-4 text-primary" />
          <span className="font-medium">{hubCount}</span>
          <span className="text-muted-foreground">hubs</span>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-secondary text-sm">
          <Calendar className="w-4 h-4 text-accent" />
          <span className="font-medium">{eventCount}</span>
          <span className="text-muted-foreground">events</span>
        </div>
      </div>

      {/* Category filters */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide mb-6 -mx-4 px-4">
        {CATEGORY_FILTERS.map((f) => {
          const active = activeCategory === f.key;
          const color = categoryColors[f.key];
          return (
            <button
              key={f.key}
              onClick={() => setActiveCategory(f.key)}
              className={cn(
                'px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all flex items-center gap-2',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-foreground/70 hover:bg-secondary/70'
              )}
            >
              {f.key !== 'All' && (
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: color || '#4A90E2' }}
                />
              )}
              {EMOJI[f.key] && f.key !== 'All' && <span>{EMOJI[f.key]}</span>}
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Map */}
      <div className="relative h-[60vh] md:h-[70vh] min-h-[500px] rounded-3xl overflow-hidden border border-border/60 shadow-xl shadow-black/5 bg-secondary">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <CampusMap pins={filteredPins} center={campus.center} zoom={16} />
        )}

        {!loading && filteredPins.length === 0 && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-white px-4 py-2 rounded-full shadow-lg text-sm">
            No pins for this filter
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-6 p-5 rounded-2xl bg-card border border-border/60">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Legend
        </p>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {Object.entries(categoryColors).map(([cat, color]) => (
            <div key={cat} className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full border-2 border-white"
                style={{ backgroundColor: color, boxShadow: '0 1px 4px rgba(0,0,0,0.15)' }}
              />
              <span className="text-foreground/80">{EMOJI[cat]} {cat}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}