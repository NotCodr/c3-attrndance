import React from 'react';

export default function ChartCard({ title, subtitle, action, children, className = '' }) {
  return (
    <div className={`c3-card p-5 ${className}`}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="font-display font-bold text-lg leading-tight">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}