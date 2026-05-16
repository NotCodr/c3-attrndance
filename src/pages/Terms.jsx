import React from 'react';
import { Link } from 'react-router-dom';

export default function Terms() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-16 text-foreground">
      <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">← back</Link>
      <h1 className="text-3xl font-medium mt-6 mb-4">Terms of service</h1>
      <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
        <p>Connect3 is a free tool for university club committees. By using it, you agree to use it lawfully and to take responsibility for the accuracy of data you submit to your student union.</p>
        <p>We provide the service "as is" without warranty. We do not guarantee that grant claims submitted through Connect3 will be accepted by your student union.</p>
        <p>You retain ownership of your data. We retain the right to delete accounts that violate these terms or that misuse the platform.</p>
        <p>Contact hello@connect3.app.</p>
      </div>
    </div>
  );
}