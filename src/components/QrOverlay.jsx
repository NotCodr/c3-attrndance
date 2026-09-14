import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';
import { ticketNumber } from '@/lib/ticket';

/**
 * The check-in QR on a plain white screen, as large as it will go, for the
 * scanner at the door. Tapping anywhere or pressing Escape closes it.
 */
export default function QrOverlay({ open, onClose, qrDataUrl, data }) {
  const reduce = useReducedMotion();
  const { rsvp, event, club, ticket } = data || {};
  const number = ticketNumber(ticket?.number);
  const openedAt = useRef(0);

  // On a phone, the click that follows the tap which opened this can land on
  // it straight away; ignore closes in that first moment.
  const closeFromTap = () => { if (performance.now() - openedAt.current > 400) onClose(); };

  useEffect(() => {
    if (!open) return undefined;
    openedAt.current = performance.now();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {open && qrDataUrl && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Your check-in QR code"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={closeFromTap}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white px-6 text-center text-[#1E1836]"
        >
          <button type="button" onClick={onClose} autoFocus className="absolute right-5 top-5 grid h-11 w-11 place-items-center rounded-full bg-[#F1EEF8]" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
          <p className="font-mono text-xs font-bold uppercase tracking-[0.22em] text-[#5B5184]">{club?.name}</p>
          <p className="mt-1 max-w-sm text-balance font-display text-2xl font-bold">{event?.title}</p>
          <motion.img
            initial={reduce ? false : { scale: 0.9 }}
            animate={{ scale: 1 }}
            src={qrDataUrl}
            alt="Your check-in QR code"
            className="mt-6 aspect-square w-full max-w-[22rem]"
          />
          <p className="mt-5 font-mono text-base font-bold uppercase tracking-[0.08em]">
            {rsvp?.full_name}{number && <span className="ml-2 text-[#6D4FD8]">{number}</span>}
          </p>
          <p className="mt-1 text-sm text-[#5B5184]">Turn your screen brightness up for the scanner.</p>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
