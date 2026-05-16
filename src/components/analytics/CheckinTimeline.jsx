import React, { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import ChartCard from './ChartCard';

// Bucket check-ins into 15-min slots between event start and now (or event end).
export default function CheckinTimeline({ event, checkIns }) {
  const data = useMemo(() => {
    if (!event || !event.starts_at) return [];
    const start = new Date(event.starts_at).getTime();
    const end = Math.min(Date.now(), new Date(event.ends_at || Date.now()).getTime());
    if (end <= start) return [];

    const bucketMs = 15 * 60 * 1000;
    const buckets = Math.max(1, Math.ceil((end - start) / bucketMs));
    const out = Array.from({ length: buckets }, (_, i) => ({
      t: new Date(start + i * bucketMs),
      count: 0,
    }));

    checkIns.forEach((ci) => {
      const ts = new Date(ci.checked_in_at).getTime();
      if (ts < start || ts > end) return;
      const idx = Math.min(buckets - 1, Math.floor((ts - start) / bucketMs));
      out[idx].count += 1;
    });

    let running = 0;
    return out.map((b) => {
      running += b.count;
      return {
        label: b.t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
        checkIns: b.count,
        cumulative: running,
      };
    });
  }, [event, checkIns]);

  if (data.length === 0) {
    return (
      <ChartCard title="check-in flow" subtitle="real-time attendance">
        <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
          no check-in data yet
        </div>
      </ChartCard>
    );
  }

  return (
    <ChartCard title="check-in flow" subtitle="15-minute intervals">
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ left: -10, right: 8, top: 6, bottom: 0 }}>
            <defs>
              <linearGradient id="cinGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(257, 65%, 65%)" stopOpacity={0.5} />
                <stop offset="100%" stopColor="hsl(257, 65%, 65%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '2px solid hsl(var(--border))',
                borderRadius: 12,
                fontSize: 12,
              }}
            />
            <Area
              type="monotone"
              dataKey="cumulative"
              stroke="hsl(257, 65%, 65%)"
              strokeWidth={2.5}
              fill="url(#cinGradient)"
              name="cumulative"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}