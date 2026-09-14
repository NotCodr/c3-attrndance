import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { receiptFor, RECEIPT_INK, RECEIPT_MUTED, RECEIPT_PAPER } from '@/lib/receipt';

const EASE = [0.16, 1, 0.3, 1];

// The torn bottom edge: teeth every 3.5% across, 0.75em deep.
const ZIGZAG = (() => {
  const points = ['0 0', '100% 0'];
  for (let i = 0; i <= 28; i++) {
    points.push(`${+(100 - i * 3.5).toFixed(1)}% ${i % 2 ? '100%' : 'calc(100% - .75em)'}`);
  }
  points.push('0 100%');
  return `polygon(${points.join(', ')})`;
})();

const LEADER = { flex: 1, minWidth: '1.5em', borderBottom: '1.5px dotted #B8B0CC', transform: 'translateY(-.25em)' };

/**
 * The ticket printed as a thermal receipt: the same paper that hangs from the
 * lanyard on the ticket page, laid flat. Sized in em from a 12px base, so
 * `scale` grows the whole slip together. `reveal` prints it out from the top.
 */
export default function ReceiptTicket({ data, qrDataUrl, onShowQr, clip = false, reveal = false, scale = 1, className = '' }) {
  const reduce = useReducedMotion();
  const r = receiptFor(data);
  const printing = reveal && !reduce;

  return (
    <div
      className={`relative mx-auto ${className}`}
      style={{ width: '19.667em', fontSize: 12 * scale, filter: 'drop-shadow(0 1px 1px rgba(0,0,0,.35)) drop-shadow(0 14px 12px rgba(0,0,0,.25)) drop-shadow(0 40px 44px rgba(20,0,60,.4))' }}
    >
      <motion.div
        initial={printing ? { clipPath: 'inset(0% -40% 100% -40%)', y: '-1.5em' } : reveal ? { opacity: 0 } : false}
        animate={printing ? { clipPath: 'inset(0% -40% -12% -40%)', y: 0 } : { opacity: 1 }}
        transition={{ duration: printing ? 1.1 : 0.4, delay: printing ? 0.35 : 0, ease: EASE }}
        className="relative"
      >
        {clip && (
          <div aria-hidden="true" className="relative z-[3] mx-auto" style={{ width: '3em', height: '2.5em', marginBottom: '-1.1667em' }}>
            <span className="absolute top-0" style={{ left: '.667em', right: '.667em', height: '1.1667em', borderRadius: '.333em .333em 0 0', background: 'linear-gradient(180deg,#3A3A40 0%,#141416 100%)', border: '1px solid #000' }} />
            <span className="absolute inset-x-0" style={{ top: '.9167em', height: '1.5833em', borderRadius: '.5em', background: 'linear-gradient(180deg,#2C2C31 0%,#0E0E10 60%,#26262B 100%)', border: '1px solid #000', boxShadow: '0 2px 3px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.18)' }} />
            <span className="absolute bg-white opacity-90" style={{ left: '1.1667em', top: '1.5833em', width: '.667em', height: '.333em', borderRadius: 2 }} />
          </div>
        )}

        <div
          className="relative"
          style={{
            background: `url(/brand/receipt-paper.webp) repeat, ${RECEIPT_PAPER}`,
            backgroundBlendMode: 'multiply',
            fontFamily: 'var(--font-mono)',
            color: RECEIPT_INK,
            padding: '2.333em 1.667em 2.167em',
            clipPath: ZIGZAG,
          }}
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{ background: 'linear-gradient(90deg, rgba(21,16,43,.09) 0%, rgba(21,16,43,0) 14%, rgba(21,16,43,0) 84%, rgba(21,16,43,.10) 100%), linear-gradient(180deg, rgba(255,255,255,.35) 0%, rgba(255,255,255,0) 18%, rgba(21,16,43,0) 72%, rgba(21,16,43,.06) 90%, rgba(21,16,43,.16) 100%)' }}
          />
          <span aria-hidden="true" className="absolute left-1/2 rounded-full bg-[#15102B]" style={{ top: '.5em', width: '.833em', height: '.833em', marginLeft: '-.4167em', boxShadow: 'inset 0 1px 2px rgba(0,0,0,.8)' }} />

          <div className="text-center" style={{ marginTop: '.667em' }}>
            <img src="/brand/connect3-logo.png" alt="" className="mx-auto block" style={{ width: '2.1667em', height: '2.1667em', filter: 'grayscale(1) contrast(1.4) brightness(.55)' }} />
            <p style={{ margin: '.667em 0 0', fontWeight: 700, letterSpacing: '.3em' }}>CONNECT3</p>
            {r.club && <p style={{ margin: '.333em 0 0', fontSize: '.8333em', letterSpacing: '.1em', color: RECEIPT_MUTED }}>{r.club}</p>}
            <p style={{ margin: '.2em 0 0', fontSize: '.8333em', letterSpacing: '.1em', color: RECEIPT_MUTED }}>{r.editionLine}</p>
          </div>
          <p aria-hidden="true" className="overflow-hidden whitespace-nowrap" style={{ margin: '1em 0 0', fontSize: '.8333em', letterSpacing: '.06em', color: RECEIPT_MUTED }}>
            {'- '.repeat(40)}
          </p>

          <h2 style={{ margin: '1em 0 .833em', fontSize: '1.3333em', fontWeight: 700, lineHeight: 1.2, letterSpacing: '.08em', overflowWrap: 'anywhere' }}>{r.title}</h2>

          <dl className="flex flex-col" style={{ gap: '.583em' }}>
            {r.rows.map(([label, value]) => (
              <div key={label} className="flex items-baseline" style={{ gap: '.5em' }}>
                <dt style={{ color: RECEIPT_MUTED }}>{label}</dt>
                <span aria-hidden="true" style={LEADER} />
                <dd className="truncate text-right" style={{ fontWeight: 700, maxWidth: '72%' }}>{value}</dd>
              </div>
            ))}
          </dl>

          <div className="flex items-baseline justify-between" style={{ margin: '1.1667em 0 0', padding: '.833em 0', borderTop: `2px solid ${RECEIPT_INK}`, borderBottom: `2px solid ${RECEIPT_INK}` }}>
            <p style={{ fontSize: '1.5833em', fontWeight: 700, letterSpacing: '.12em', lineHeight: 1 }}>{r.status.label}</p>
            {r.status.aside && <p style={{ fontWeight: 700, letterSpacing: '.08em' }}>{r.status.aside}</p>}
          </div>
          <p className="text-center" style={{ margin: '.667em 0 0', fontSize: '.75em', letterSpacing: '.12em', color: RECEIPT_MUTED }}>{r.status.note}</p>

          {r.showQr ? (
            <button
              type="button"
              onClick={onShowQr}
              disabled={!qrDataUrl || !onShowQr}
              aria-label="Show your check-in QR code full screen"
              className="mx-auto block bg-white transition hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6D4FD8] disabled:hover:scale-100"
              style={{ width: '72%', margin: '1em auto 0', padding: '.5em', boxShadow: `0 0 0 1.5px ${RECEIPT_INK}` }}
            >
              {qrDataUrl
                ? <img src={qrDataUrl} alt="Your check-in QR code" className="block aspect-square w-full" />
                : <span className="block aspect-square w-full animate-pulse bg-[#EDE9E0]" />}
            </button>
          ) : (
            <svg aria-hidden="true" viewBox="0 0 100 38" preserveAspectRatio="none" className="mx-auto block" style={{ width: '90%', height: '3.1667em', margin: '1.333em auto 0', filter: 'blur(.25px) contrast(1.2)' }}>
              {r.bars.map((b) => <rect key={b.x} x={b.x * 100} y="0" width={b.w * 100} height="38" fill={RECEIPT_INK} />)}
            </svg>
          )}
          <p className="text-center" style={{ margin: '.5em 0 0', fontSize: '.8333em', letterSpacing: '.22em', color: '#3A3260' }}>{r.code}</p>
        </div>

        <img
          src={r.sticker}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute"
          style={{ top: clip ? '2.833em' : '1.5em', right: '-2em', width: '6.1667em', transform: 'rotate(12deg)', filter: 'drop-shadow(0 2px 0 #15102B)' }}
        />
      </motion.div>
    </div>
  );
}
