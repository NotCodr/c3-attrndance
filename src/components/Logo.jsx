import React from 'react';

const LOGO_URL = 'https://media.base44.com/images/public/6a083c7537b39dfd4b4eb9a0/d5113c5b1_generated_image.png';

export default function Logo({ size = 36, withWordmark = false, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <img
        src={LOGO_URL}
        alt="connect3"
        width={size}
        height={size}
        className="rounded-full"
        style={{ width: size, height: size }}
      />
      {withWordmark && (
        <span className="font-display font-bold tracking-tight text-foreground" style={{ fontSize: size * 0.55 }}>
          connect3
        </span>
      )}
    </span>
  );
}

export { LOGO_URL };