import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useOutletContext, Link } from 'react-router-dom';
import { db } from '@/api/db';
import { getClubBySlug } from '@/lib/clubs';
import { BarChart3, Users, CheckCircle2, TrendingUp, Calendar, RefreshCw } from 'lucide-react';
import StatTile from '@/components/analytics/StatTile';
import ChartCard from '@/components/analytics/ChartCard';
import CheckinTimeline from '@/components/analytics/CheckinTimeline';
import DemographicsBreakdown from '@/components/analytics/DemographicsBreakdown';
import HistoricalTrends from '@/components/analytics/HistoricalTrends';

const REFRESH_MS = 15_000;

export default function Analytics() {
  const { clubSlug } = useParams();
  const { user } = useOutletContext() || {};
  const [club, setClub] = useState(null);
  const [events, setEvents] = useState([]);
  const [rsvps, setRsvps] = useState([]);
  const [checkIns, setCheckIns] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState('all');
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(Date.now());

  // Load club + all related rows
  const load = async () => {
    const c = await getClubBySlug(clubSlug);
    if (!c) { setLoading(false); return; }
    setClub(c);
    const [ev, rs, ci] = await Promise.all([
      db.Event.filter({ club_id: c.id }, '-starts_at'),
      db.RSVP.filter({ club_id: c.id }),
      db.CheckIn.filter({ club_id: c.id }),
    ]);
    setEvents(ev);
    setRsvps(rs);
    setCheckIns(ci);
    setLastRefresh(Date.now());
    setLoading(false);
  };

  useEffect(() => { load(); }, [clubSlug]);

  // Live polling for the realtime feel. Cheap, and only when a live event is selected or "all".
  useEffect(() => {
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [clubSlug]);

  // Build per-event maps
  const rsvpByEvent = useMemo(() => {
    const m = {};
    rsvps.forEach((r) => { (m[r.event_id] ||= []).push(r); });
    return m;
  }, [rsvps]);

  const checkInByEvent = useMemo(() => {
    const m = {};
    checkIns.forEach((c) => { (m[c.event_id] ||= []).push(c); });
    return m;
  }, [checkIns]);

  // Currently live events (started but not ended)
  const liveEvents = useMemo(() => {
    const now = Date.now();
    return events.filter((e) => {
      const s = new Date(e.starts_at).getTime();
      const en = new Date(e.ends_at || e.starts_at).getTime();
      return e.status === 'published' && s <= now && en >= now;
    });
  }, [events]);

  const selectedEvent = selectedEventId === 'all' ? null : events.find((e) => e.id === selectedEventId);

  // Filter slices based on selection
  const visibleCheckIns = selectedEvent ? (checkInByEvent[selectedEvent.id] || []) : checkIns;
  const visibleRsvps = selectedEvent ? (rsvpByEvent[selectedEvent.id] || []) : rsvps;

  // KPIs
  const totalEvents = events.length;
  const totalRsvps = rsvps.length;
  const totalCheckIns = checkIns.length;
  const overallShowRate = totalRsvps > 0 ? Math.round((totalCheckIns / totalRsvps) * 100) : 0;

  if (loading) {
    return <div className="text-sm text-muted-foreground">loading analytics…</div>;
  }

  if (!club) {
    return <div className="text-sm text-muted-foreground">club not found.</div>;
  }

  return (
    <div className="max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <BarChart3 className="w-4 h-4 text-primary" />
            <p className="text-xs uppercase tracking-wider text-primary font-semibold">analytics</p>
          </div>
          <h1 className="font-display font-bold text-3xl sm:text-4xl">{club.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            real-time check-ins, attendee demographics, and event performance trends.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <RefreshCw className="w-3.5 h-3.5" />
          updated {new Date(lastRefresh).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
        </div>
      </div>

      {/* Live banner */}
      {liveEvents.length > 0 && (
        <div className="c3-card p-4 flex items-center justify-between flex-wrap gap-3 bg-primary/5 border-primary/30">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-primary" />
            </span>
            <div>
              <p className="text-sm font-semibold">
                {liveEvents.length} live event{liveEvents.length === 1 ? '' : 's'} right now
              </p>
              <p className="text-xs text-muted-foreground">
                {liveEvents.map((e) => e.title).join(' · ')}
              </p>
            </div>
          </div>
          {liveEvents.length === 1 && (
            <Link to={`/c/${clubSlug}/events/${liveEvents[0].id}/scan`} className="c3-btn-secondary text-sm">
              go to scanner
            </Link>
          )}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile label="events" value={totalEvents} sub="all time" icon={Calendar} tone="primary" />
        <StatTile label="total rsvps" value={totalRsvps} icon={Users} tone="blue" />
        <StatTile label="total check-ins" value={totalCheckIns} icon={CheckCircle2} tone="pink" />
        <StatTile label="show rate" value={`${overallShowRate}%`} sub="check-ins / rsvps" icon={TrendingUp} tone="yellow" />
      </div>

      {/* Event picker */}
      <ChartCard
        title="event focus"
        subtitle="select an event to see live check-ins and demographics, or view all"
      >
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedEventId('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border-2 transition ${
              selectedEventId === 'all'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card border-border hover:bg-secondary'
            }`}
          >
            all events
          </button>
          {events.slice(0, 12).map((e) => {
            const isLive = liveEvents.some((l) => l.id === e.id);
            return (
              <button
                key={e.id}
                onClick={() => setSelectedEventId(e.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border-2 transition flex items-center gap-1.5 ${
                  selectedEventId === e.id
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card border-border hover:bg-secondary'
                }`}
              >
                {isLive && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
                <span className="truncate max-w-[180px]">{e.title}</span>
              </button>
            );
          })}
        </div>
      </ChartCard>

      {/* Charts */}
      {selectedEvent ? (
        <CheckinTimeline event={selectedEvent} checkIns={visibleCheckIns} />
      ) : (
        <HistoricalTrends events={events} rsvpByEvent={rsvpByEvent} checkInByEvent={checkInByEvent} />
      )}

      <DemographicsBreakdown attendees={visibleCheckIns.length > 0 ? visibleCheckIns : visibleRsvps} />

      {selectedEvent && (
        <HistoricalTrends events={events} rsvpByEvent={rsvpByEvent} checkInByEvent={checkInByEvent} />
      )}
    </div>
  );
}