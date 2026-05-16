import React from 'react';

// Official connect3 sticker characters
const STICKER_BLUE = 'https://media.base44.com/images/public/6a083c7537b39dfd4b4eb9a0/0e06b952c_blue.png';
const STICKER_GREEN = 'https://media.base44.com/images/public/6a083c7537b39dfd4b4eb9a0/9a0224ffa_green.png';
const STICKER_ORANGE = 'https://media.base44.com/images/public/6a083c7537b39dfd4b4eb9a0/89faa2820_orange.png';
const STICKER_PINK = 'https://media.base44.com/images/public/6a083c7537b39dfd4b4eb9a0/868a56183_pink.png';
const STICKER_PURPLE = 'https://media.base44.com/images/public/6a083c7537b39dfd4b4eb9a0/c563850ba_purple.png';
const STICKER_YELLOW = 'https://media.base44.com/images/public/6a083c7537b39dfd4b4eb9a0/4d8029794_yellow.png';

function Floaty({ src, top, left, right, bottom, size, rot = 0, delay = false, alt = '' }) {
  return (
    <img
      src={src}
      alt={alt}
      aria-hidden="true"
      className={`absolute pointer-events-none select-none ${delay ? 'float-slower float-delay' : 'float-slow'}`}
      style={{ top, left, right, bottom, width: size, height: size, '--rot': `${rot}deg`, transform: `rotate(${rot}deg)` }}
    />
  );
}

export default function Decorations({ variant = 'hero' }) {
  if (variant === 'hero') {
    return (
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <Floaty src={STICKER_BLUE} top="8%" left="5%" size={120} rot={-12} />
        <Floaty src={STICKER_PURPLE} top="14%" right="6%" size={130} rot={10} delay />
        <Floaty src={STICKER_PINK} bottom="12%" right="4%" size={140} rot={18} />
        <Floaty src={STICKER_YELLOW} bottom="8%" left="4%" size={100} rot={-15} delay />
        <Floaty src={STICKER_GREEN} top="48%" left="2%" size={80} rot={8} delay />
        <Floaty src={STICKER_ORANGE} top="42%" right="2%" size={90} rot={-8} />
      </div>
    );
  }
  if (variant === 'sparse') {
    return (
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <Floaty src={STICKER_BLUE} top="-30px" right="-20px" size={110} rot={20} />
        <Floaty src={STICKER_PINK} bottom="-30px" left="-20px" size={120} rot={-12} delay />
      </div>
    );
  }
  return null;
}

export { STICKER_BLUE, STICKER_GREEN, STICKER_ORANGE, STICKER_PINK, STICKER_PURPLE, STICKER_YELLOW };