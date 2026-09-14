import React, { useState } from 'react';
import { useReducedMotion } from 'motion/react';
import useReceiptArt from '@/components/receipt/useReceiptArt';
import ReceiptPrinter from '@/components/receipt/ReceiptPrinter';
import { MARGIN, PAPER_W } from '@/components/receipt/drawReceipt';

const PRINTER_ROOM = 40;

/**
 * The slip printed flat, as right after RSVPing: a printer feeds it out and
 * lifts away, leaving the receipt. Tapping the receipt opens the QR.
 */
export default function PrintedReceipt({ data, qrDataUrl, onShowQr, paperWidth = 272 }) {
  const reduce = useReducedMotion();
  const { model, art } = useReceiptArt(data, qrDataUrl);
  const [gone, setGone] = useState(false);
  const scale = paperWidth / PAPER_W;
  const width = (PAPER_W + MARGIN * 2) * scale;
  const height = art ? art.height * scale : 0;
  const rect = { left: 0, top: PRINTER_ROOM, width, height };
  const done = gone || reduce;

  return (
    <div
      className="relative mx-auto max-w-full"
      style={{ width, height: art ? PRINTER_ROOM + height : 520, filter: 'drop-shadow(0 22px 26px rgba(20,0,60,.4))' }}
    >
      {!done && (
        <ReceiptPrinter
          src={art?.url}
          rect={rect}
          paperWidth={PAPER_W * scale}
          bands={art ? art.bands.map(([top, bottom]) => [top * scale, bottom * scale]) : []}
          onGone={() => setGone(true)}
        />
      )}
      {art && done && (
        <button
          type="button"
          onClick={onShowQr}
          disabled={!model.showQr || !onShowQr}
          aria-label="Show your check-in QR code full screen"
          className="absolute block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-default"
          style={rect}
        >
          <img src={art.url} alt="" draggable={false} className="block h-full w-full" />
        </button>
      )}
      {model && <ReceiptText data={data} model={model} />}
    </div>
  );
}

/** The slip's words for screen readers, since the paper itself is an image. */
export function ReceiptText({ data, model }) {
  const { status } = model;
  return (
    <div className="sr-only">
      {model.issuer && <p>{model.issuer} presents</p>}
      <h2>{data.event.title}</h2>
      <dl>
        {[...model.event, ...model.guest].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {model.address && <p>{model.address}</p>}
      <p>
        {model.showQr
          ? 'Your QR code is on the ticket. Use Show my QR to open it full screen.'
          : [status.headline, status.aside, status.detail].filter(Boolean).join(' · ')}
      </p>
      {model.footer && <p>{model.footer}</p>}
    </div>
  );
}
