import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CalendarPlus, Download } from 'lucide-react';
import CrtButton from '@/components/CrtButton';
import { GlassButton } from '@/components/EventShell';
import { downloadIcs, googleCalendarUrl } from '@/lib/calendar';

/**
 * "Add to calendar" with the two options that cover nearly everyone: Google
 * Calendar in a new tab, or an .ics file for Apple Calendar and Outlook.
 */
export default function AddToCalendar({ event, url = '', variant = 'glass', placement = 'top', className = '', label = 'Add to calendar' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const Trigger = variant === 'crt' ? CrtButton : GlassButton;
  const details = url ? `Your ticket: ${url}` : '';

  return (
    <div ref={ref} className={`relative ${className}`}>
      <Trigger
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="w-full"
        {...(variant === 'crt' ? { size: 'lg' } : {})}
      >
        <CalendarPlus className="h-4 w-4" /> {label}
      </Trigger>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: placement === 'top' ? 6 : -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: placement === 'top' ? 6 : -6, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className={`absolute left-0 right-0 z-40 min-w-[14rem] overflow-hidden rounded-2xl bg-white p-1.5 text-foreground shadow-2xl ring-1 ring-black/5 ${
              placement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'
            }`}
          >
            <a
              role="menuitem"
              href={googleCalendarUrl(event, { details })}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-secondary"
            >
              <CalendarPlus className="h-4 w-4 text-primary" /> Google Calendar
            </a>
            <button
              type="button"
              role="menuitem"
              onClick={() => { downloadIcs(event, { url, details: '' }); setOpen(false); }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium hover:bg-secondary"
            >
              <Download className="h-4 w-4 text-primary" /> Apple or Outlook (.ics)
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
