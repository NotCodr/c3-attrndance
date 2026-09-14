import { useEffect, useMemo, useState } from 'react';
import { receiptFor } from '@/lib/receipt';
import { drawReceipt, loadReceiptAssets } from '@/components/receipt/drawReceipt';

/**
 * The printed slip for a ticket: its words (`model`), both faces drawn on
 * canvases, and an image URL of the front for showing it flat (`art`).
 * `art` is null until the font and images are in, and false if drawing failed.
 */
export default function useReceiptArt(data, qrDataUrl) {
  const model = useMemo(() => (data ? receiptFor(data) : null), [data]);
  const [art, setArt] = useState(null);

  useEffect(() => {
    if (!model) return undefined;
    let cancelled = false;
    let url = null;
    (async () => {
      const assets = await loadReceiptAssets(model, qrDataUrl);
      const drawn = drawReceipt(model, assets);
      const blob = await new Promise((resolve) => drawn.front.toBlob(resolve, 'image/png'));
      if (cancelled) return;
      url = blob ? URL.createObjectURL(blob) : drawn.front.toDataURL('image/png');
      setArt({ ...drawn, url });
    })().catch(() => {
      if (!cancelled) setArt(false);
    });
    return () => {
      cancelled = true;
      if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
    };
  }, [model, qrDataUrl]);

  return { model, art };
}
