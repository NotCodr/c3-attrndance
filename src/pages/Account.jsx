import React from 'react';
import { useOutletContext } from 'react-router-dom';

export default function Account() {
  const { user } = useOutletContext() || {};
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-medium mb-1">account</h1>
      <p className="text-sm text-muted-foreground mb-6">Your sign-in details.</p>
      <div className="c3-card p-5 space-y-3 text-sm">
        <div className="flex justify-between"><span className="text-muted-foreground">name</span><span>{user?.full_name || '—'}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">email</span><span>{user?.email || '—'}</span></div>
      </div>
    </div>
  );
}