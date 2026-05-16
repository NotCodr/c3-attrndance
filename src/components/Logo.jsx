import React from 'react';

const LOGO_URL = 'https://media.base44.com/images/public/6a083c7537b39dfd4b4eb9a0/4f9014222_connect3-logo.png';
const LOGO_WHITE_URL = 'https://media.base44.com/images/public/6a083c7537b39dfd4b4eb9a0/8727c5a38_connect3-logo-white.png';

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