import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { ScanLine, FileText, Receipt, ArrowRight, Github, Search } from 'lucide-react';
import Logo from '@/components/Logo';
import Decorations from '@/components/Decorations';

function Section({ children, className = '' }) {
  return <section className={`max-w-6xl mx-auto px-6 ${className}`}>{children}</section>;
}

export default function Landing() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen text-foreground">
      {/* Nav */}
      <header className="relative z-10">
        <div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <Logo size={44} />
            <span className="font-display font-bold text-2xl tracking-tight">connect3</span>
          </Link>
          <Link to={user ? '/dashboard' : '/login'} className="c3-btn-primary">
            {user ? 'my clubs' : 'sign in'} <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </header>

      {/* Hero */}
      <div className="relative">
        <Decorations variant="hero" />
        <Section className="relative pt-12 pb-32 text-center">
          <div className="inline-block c3-chip-purple mb-6">
            ✨ for university club committees
          </div>
          <h1 className="font-display font-bold uppercase tracking-tight text-5xl md:text-7xl lg:text-8xl text-balance leading-[0.95]">
            it takes three<br />
            <span className="relative inline-block">
              <span className="relative z-10">to connect</span>
              <span className="absolute -bottom-1 left-0 right-0 h-4 md:h-6 bg-primary/40 rounded-full -z-0" aria-hidden />
            </span>
          </h1>
          <p className="mt-8 text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto text-balance">
            find events, run clubs, file grants — all-in-one. Built for UniMelb clubs first.
          </p>
          <div className="mt-10 flex items-center justify-center gap-3 flex-wrap">
            <Link to={user ? '/dashboard' : '/signup'} className="c3-btn-primary text-base px-7 py-3.5">
              {user ? 'my clubs' : 'start a club'} <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/explore" className="c3-btn-secondary text-base px-7 py-3.5">
              <Search className="w-4 h-4" /> find an event
            </Link>
          </div>
        </Section>
      </div>

      {/* The pain */}
      <Section className="py-20">
        <h2 className="text-3xl md:text-5xl font-display font-bold text-center text-balance max-w-3xl mx-auto leading-tight">
          stayed up at 1am chasing receipts? <span className="text-primary">we get it.</span>
        </h2>
        <div className="mt-14 grid md:grid-cols-3 gap-5">
          {[
            { icon: FileText, title: 'paper attendance lists', body: 'Hand-written sheets that get lost or smudged.', tilt: '-rotate-1' },
            { icon: Receipt, title: 'scattered receipts', body: 'WhatsApp threads, photo rolls, email inboxes.', tilt: 'rotate-1' },
            { icon: FileText, title: 'manual AFP forms', body: 'Typing the same details across PDFs every term.', tilt: '-rotate-1' },
          ].map((c) => (
            <div key={c.title} className={`c3-card p-7 ${c.tilt} hover:rotate-0 transition-transform`}>
              <div className="w-12 h-12 rounded-2xl bg-primary/15 flex items-center justify-center mb-4">
                <c.icon className="w-6 h-6 text-primary" />
              </div>
              <p className="font-display font-bold text-xl mb-2">{c.title}</p>
              <p className="text-sm text-muted-foreground">{c.body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* What you get */}
      <div className="relative">
        <Decorations variant="sparse" />
        <Section className="relative py-24">
          <p className="text-sm uppercase tracking-widest text-primary text-center mb-3 font-semibold">what you get</p>
          <h2 className="text-3xl md:text-5xl font-display font-bold text-center text-balance leading-tight">
            from event night to submitted,<br />in minutes.
          </h2>
          <div className="mt-14 grid md:grid-cols-3 gap-5">
            {[
              { icon: ScanLine, title: 'QR check-in', body: 'Students scan in at the door. Timestamps captured server-side, UMSU-compliant.', n: 1 },
              { icon: FileText, title: 'green sheet PDF', body: 'Auto-generated attendance with full name, student number, course, and arrival time.', n: 2 },
              { icon: Receipt, title: 'one-click acquittal pack', body: 'Photos, receipts, attendance, and a pre-filled AFP — combined into one PDF.', n: 3 },
            ].map((c) => (
              <div key={c.title} className="c3-card p-7">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center font-display font-bold text-lg">
                    {c.n}
                  </div>
                  <c.icon className="w-5 h-5 text-muted-foreground" />
                </div>
                <p className="font-display font-bold text-xl mb-2">{c.title}</p>
                <p className="text-sm text-muted-foreground">{c.body}</p>
              </div>
            ))}
          </div>
        </Section>
      </div>

      {/* CTA card */}
      <Section className="py-12">
        <div className="c3-card p-10 md:p-14 text-center relative overflow-hidden">
          <Decorations variant="sparse" />
          <div className="relative">
            <Logo size={72} className="mb-6" />
            <h3 className="font-display font-bold text-3xl md:text-4xl mb-3 text-balance">
              ready to skip the paperwork?
            </h3>
            <p className="text-muted-foreground mb-8 max-w-md mx-auto">
              free for student clubs. set up in under 5 minutes.
            </p>
            <Link to={user ? '/dashboard' : '/signup'} className="c3-btn-primary text-base px-7 py-3.5">
              get started <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </Section>

      {/* Footer */}
      <footer className="py-10">
        <Section className="flex flex-wrap items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Logo size={24} />
            <span>© {new Date().getFullYear()} connect3 · built by DSCubed at UniMelb</span>
          </div>
          <div className="flex items-center gap-5">
            <Link to="/privacy" className="hover:text-foreground">privacy</Link>
            <Link to="/terms" className="hover:text-foreground">terms</Link>
            <a href="mailto:hello@connect3.app" className="hover:text-foreground">contact</a>
            <a href="https://github.com/NotCodr/c3-attrndance" target="_blank" rel="noreferrer" className="hover:text-foreground inline-flex items-center gap-1">
              <Github className="w-3.5 h-3.5" /> github
            </a>
          </div>
        </Section>
      </footer>
    </div>
  );
}