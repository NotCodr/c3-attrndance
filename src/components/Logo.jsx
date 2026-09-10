import React from 'react';

const LOGO_URL = '/brand/connect3-logo.png';
const LOGO_WHITE_URL = '/brand/connect3-logo-white.png';

export default function Logo({ size = 36, white = false, withWordmark = false, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <img
        src={white ? LOGO_WHITE_URL : LOGO_URL}
        alt="connect3"
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className="select-none"
      />
      {withWordmark && (
        <span className="font-display font-bold tracking-tight text-foreground" style={{ fontSize: size * 0.55 }}>
          connect3
        </span>
      )}
    </span>
  );
}

export { LOGO_URL, LOGO_WHITE_URL };