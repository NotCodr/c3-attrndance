import React from 'react';
import { Link } from 'react-router-dom';

export default function Privacy() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-16 text-foreground">
      <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">← back</Link>
      <h1 className="text-3xl font-medium mt-6 mb-4">Privacy policy</h1>
      <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
        <p><strong className="text-foreground">What we collect.</strong> When you RSVP to an event we collect your full name, email address, and (for grant-funded events) your student number and course of study. We also record your IP address briefly for abuse detection.</p>
        <p><strong className="text-foreground">Why.</strong> Event organisation and student-union grant compliance. Australian student unions (UMSU and equivalents) require timestamped attendance records to release grant funding.</p>
        <p><strong className="text-foreground">Who sees it.</strong> The club committee organising the event; Connect3 staff for support; the student union when the treasurer submits a grant pack.</p>
        <p><strong className="text-foreground">Retention.</strong> Data is retained for 12 months after the event, then anonymised. Cancelled RSVPs are immediately anonymised, except an anonymised attendance row is retained for grant-funded events because the student union may audit attendance records for up to 12 months.</p>
        <p><strong className="text-foreground">Your rights.</strong> You may request access, correction, or deletion of your personal data at any time. Email hello@connect3.app.</p>
        <p><strong className="text-foreground">What we don't do.</strong> No third-party tracking; no advertising; we do not sell your data.</p>
        <p>This service is provided by Connect3 in Victoria, Australia, and complies with the Australian Privacy Principles.</p>
      </div>
    </div>
  );
}