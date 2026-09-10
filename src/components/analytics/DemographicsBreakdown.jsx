import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import ChartCard from './ChartCard';

const COLORS = [
  'hsl(257, 65%, 65%)', // purple
  'hsl(210, 85%, 70%)', // blue
  'hsl(340, 80%, 75%)', // pink
  'hsl(45, 90%, 65%)',  // yellow
  'hsl(150, 55%, 65%)', // green
  'hsl(20, 85%, 70%)',  // orange
];

function bucket(arr, accessor, fallback = 'unknown') {
  const map = new Map();
  arr.forEach((row) => {
    const v = (accessor(row) || '').toString().trim() || fallback;
    map.set(v, (map.get(v) || 0) + 1);
  });
  return Array.from(map.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

export default function DemographicsBreakdown({ attendees }) {
  const { membership, courses } = useMemo(() => {
    const m = bucket(attendees, (r) => (r.is_member ? 'members' : 'non-members'));
    let c = bucket(attendees, (r) => r.course, '-');
    // Cap at top 5; collapse the rest into "other"
    if (c.length > 5) {
      const top = c.slice(0, 5);
      const rest = c.slice(5).reduce((s, x) => s + x.value, 0);
      c = [...top, { name: 'other', value: rest }];
    }
    return { membership: m, courses: c };
  }, [attendees]);

  const empty = attendees.length === 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ChartCard title="member vs non-member" subtitle="attendee mix">
        {empty ? (
          <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">no attendees yet</div>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={membership} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {membership.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '2px solid hsl(var(--border))', borderRadius: 12, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      <ChartCard title="top courses" subtitle="where attendees come from">
        {empty ? (
          <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">no attendees yet</div>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={courses} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {courses.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '2px solid hsl(var(--border))', borderRadius: 12, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>
    </div>
  );
}