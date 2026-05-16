import React from 'react';
import { Link } from 'react-router-dom';
import { ScanLine, FileText, Receipt, ArrowRight, Github } from 'lucide-react';

function Section({ children, className = '' }) {
  return <section className={`max-w-5xl mx-auto px-6 ${className}`}>{children}</section>;
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium">c3</div>
            <span className="font-medium tracking-tight">connect3</span>
          </Link>
          <Link to="/dashboard" className="c3-btn-secondary text-xs">sign in</Link>
        </div>
      </header>

      {/* Hero */}
      <Section className="pt-20 pb-24 text-center">
        <p className="text-xs text-primary mb-4 tracking-wider uppercase">for university club committees</p>
        <h1 className="text-4xl md:text-6xl font-medium tracking-tight text-balance">
          The paperwork tool every club committee secretly wants.
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto text-balance">
          Connect3 turns grant-funded events into one-click acquittal packs. Built for UniMelb clubs first.
        </p>
        <div className="mt-10 flex items-center justify-center gap-3">
          <Link to="/dashboard" className="c3-btn-primary text-base px-6 py-3">
            Try it free — no card
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </Section>

      {/* The pain */}
      <Section className="py-20 border-t border-border">
        <h2 className="text-2xl md:text-3xl font-medium text-center text-balance max-w-2xl mx-auto">
          If you've ever stayed up at 1am chasing photos and receipts for an AFP, you know the problem.
        </h2>
        <div className="mt-12 grid md:grid-cols-3 gap-4">
          {[
            { icon: FileText, title: 'paper attendance lists', body: 'Hand-written sheets that get lost or smudged.' },
            { icon: Receipt, title: 'scattered receipts', body: 'WhatsApp threads, photo rolls, email inboxes.' },
            { icon: FileText, title: 'manual AFP forms', body: 'Typing the same details across PDFs every term.' },
          ].map((c) => (
            <div key={c.title} className="c3-card p-6">
              <c.icon className="w-5 h-5 text-primary mb-3" />
              <p className="font-medium mb-1">{c.title}</p>
              <p className="text-sm text-muted-foreground">{c.body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* What you get */}
      <Section className="py-20 border-t border-border">
        <p className="text-xs uppercase tracking-wider text-primary text-center mb-2">what you get</p>
        <h2 className="text-2xl md:text-3xl font-medium text-center text-balance">From event night to submitted, in minutes.</h2>
        <div className="mt-12 grid md:grid-cols-3 gap-4">
          {[
            { icon: ScanLine, title: 'QR check-in', body: 'Students scan in at the door. Timestamps captured server-side, UMSU-compliant.' },
            { icon: FileText, title: 'Green sheet PDF', body: 'Auto-generated attendance record with full name, student number, course, and arrival time.' },
            { icon: Receipt, title: 'One-click acquittal pack', body: 'Photos, receipts, attendance, and a pre-filled Application for Payment — combined into one PDF.' },
          ].map((c, i) => (
            <div key={c.title} className="c3-card p-6">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                <span className="w-5 h-5 rounded-full bg-secondary border border-border flex items-center justify-center">{i + 1}</span>
              </div>
              <c.icon className="w-5 h-5 text-primary mb-3" />
              <p className="font-medium mb-1">{c.title}</p>
              <p className="text-sm text-muted-foreground">{c.body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Trust */}
      <Section className="py-16 border-t border-border text-center">
        <p className="text-sm text-muted-foreground">
          Built by DSCubed at UniMelb. Free for student clubs. <span className="text-foreground">Open source.</span>
        </p>
      </Section>

      {/* Footer */}
      <footer className="border-t border-border py-10 mt-4">
        <Section className="flex flex-wrap items-center justify-between gap-4 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} Connect3</span>
          <div className="flex items-center gap-5">
            <Link to="/privacy" className="hover:text-foreground">privacy</Link>
            <Link to="/terms" className="hover:text-foreground">terms</Link>
            <a href="mailto:hello@connect3.app" className="hover:text-foreground">contact</a>
            <a href="https://github.com" target="_blank" rel="noreferrer" className="hover:text-foreground inline-flex items-center gap-1">
              <Github className="w-3.5 h-3.5" /> github
            </a>
          </div>
        </Section>
      </footer>
    </div>
  );
}