import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import ChartCard from './ChartCard';

// For each past event compute: rsvps, checkIns, show-rate %.
export default function HistoricalTrends({ events, rsvpByEvent, checkInByEvent }) {
  const data = useMemo(() => {
    return events
      .filter((e) => ['completed', 'published'].includes(e.status))
      .map((e) => {
        const rsvps = (rsvpByEvent[e.id] || []).length;
        const checkIns = (checkInByEvent[e.id] || []).length;
        const showRate = rsvps > 0 ? Math.round((checkIns / rsvps) * 100) : 0;
        return {
          name: e.title.length > 18 ? e.title.slice(0, 16) + '…' : e.title,
          rsvps,
          checkIns,
          showRate,
          date: new Date(e.starts_at).getTime(),
        };
      })
      .sort((a, b) => a.date - b.date)
      .slice(-10); // last 10 events
  }, [events, rsvpByEvent, checkInByEvent]);

  if (data.length === 0) {
    return (
      <ChartCard title="event history" subtitle="rsvps vs check-ins per event">
        <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
          no historical events yet
        </div>
      </ChartCard>
    );
  }

  return (
    <ChartCard title="event history" subtitle={`last ${data.length} event${data.length === 1 ? '' : 's'}, rsvps vs check-ins`}>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ left: -10, right: 8, top: 6, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" interval={0} angle={-20} textAnchor="end" height={60} />
            <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
            <Tooltip
              contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '2px solid hsl(var(--border))', borderRadius: 12, fontSize: 12 }}
              formatter={(val, key) => key === 'showRate' ? [`${val}%`, 'show rate'] : [val, key]}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="rsvps" fill="hsl(210, 85%, 78%)" radius={[8, 8, 0, 0]} name="rsvps" />
            <Bar dataKey="checkIns" fill="hsl(257, 65%, 65%)" radius={[8, 8, 0, 0]} name="check-ins" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}