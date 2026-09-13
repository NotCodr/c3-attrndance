import React from 'react';

const PASTELS = ['#CFF4FF', '#FFE0EC', '#FFF4D9', '#D9F7E7', '#EDE7FF', '#FFE6D6'];

/** A stable pastel for a name, so the same person always gets the same colour. */
export function pastelFor(text = '') {
  let h = 0;
  for (const ch of String(text)) h = (Math.imul(h, 31) + ch.codePointAt(0)) >>> 0;
  return PASTELS[h % PASTELS.length];
}

/**
 * A round, ink-outlined avatar: the image when there is one, otherwise initials
 * on a pastel. Deliberately not a sticker character, which would read as a
 * profile picture the person never chose.
 */
export default function InitialsAvatar({ name = '', src, size = 34, className = '' }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.36) };
  if (src) {
    return <img src={src} alt="" style={style} className={`shrink-0 rounded-full border-2 border-[hsl(var(--c3-ink))] object-cover ${className}`} />;
  }
  const initials = String(name).trim().split(/\s+/).filter(Boolean).slice(0, 2)
    .map((w) => Array.from(w)[0]).join('').toUpperCase() || '?';
  return (
    <span
      aria-hidden="true"
      style={{ ...style, background: pastelFor(name) }}
      className={`grid shrink-0 place-items-center rounded-full border-2 border-[hsl(var(--c3-ink))] font-display font-bold text-[hsl(var(--c3-ink))] ${className}`}
    >
      {initials}
    </span>
  );
}
