import React from 'react';
import { Sparkles } from 'lucide-react';

export default function EmptyState({ icon: Icon = Sparkles, title, description, action }) {
  return (
    <div className="text-center py-16 px-6">
      <div className="w-16 h-16 mx-auto rounded-2xl bg-secondary flex items-center justify-center mb-4">
        <Icon className="w-7 h-7 text-muted-foreground" />
      </div>
      <h3 className="font-display text-xl font-semibold mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-6">{description}</p>
      )}
      {action}
    </div>
  );
}