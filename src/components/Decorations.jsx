import React from 'react';

const STAR_BLUE = 'https://media.base44.com/images/public/6a083c7537b39dfd4b4eb9a0/21be1188a_generated_image.png';
const STAR_WARM = 'https://media.base44.com/images/public/6a083c7537b39dfd4b4eb9a0/4dc11a7e7_generated_image.png';
const CLOUD = 'https://media.base44.com/images/public/6a083c7537b39dfd4b4eb9a0/55f901450_generated_image.png';

function Floaty({ src, top, left, right, bottom, size, rot = 0, delay = false, alt = '' }) {
  return (
    <img
      src={src}
      alt={alt}
      aria-hidden="true"
      className={`absolute pointer-events-none select-none mix-blend-multiply ${delay ? 'float-slower float-delay' : 'float-slow'}`}
      style={{ top, left, right, bottom, width: size, height: size, '--rot': `${rot}deg`, transform: `rotate(${rot}deg)` }}
    />
  );
}

export default function Decorations({ variant = 'hero' }) {
  if (variant === 'hero') {
    return (
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <Floaty src={STAR_BLUE} top="8%" left="6%" size={140} rot={-15} />
        <Floaty src={CLOUD} top="12%" right="4%" size={170} rot={8} delay />
        <Floaty src={STAR_WARM} bottom="14%" right="8%" size={120} rot={20} />
        <Floaty src={STAR_WARM} bottom="6%" left="3%" size={100} rot={-10} delay />
      </div>
    );
  }
  if (variant === 'sparse') {
    return (
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <Floaty src={STAR_BLUE} top="-30px" right="-30px" size={120} rot={20} />
        <Floaty src={CLOUD} bottom="-40px" left="-30px" size={140} rot={-10} delay />
      </div>
    );
  }
  return null;
}

export { STAR_BLUE, STAR_WARM, CLOUD };