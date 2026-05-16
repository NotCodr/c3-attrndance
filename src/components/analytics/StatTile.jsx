import React from 'react';

export default function StatTile({ label, value, sub, icon: Icon, tone = 'primary' }) {
  const tones = {
    primary: 'bg-primary/10 text-primary',
    pink: 'bg-[hsl(340_80%_95%)] text-[hsl(340_70%_45%)]',
    blue: 'bg-[hsl(210_85%_94%)] text-[hsl(210_75%_45%)]',
    yellow: 'bg-[hsl(45_90%_92%)] text-[hsl(35_70%_40%)]',
  };
  return (
    <div className="c3-card p-5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
        {Icon && (
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${tones[tone] || tones.primary}`}>
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>
      <p className="font-display font-bold text-3xl leading-tight">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}