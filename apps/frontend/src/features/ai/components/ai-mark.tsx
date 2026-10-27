import { useId, type CSSProperties } from 'react';
import { motion } from 'motion/react';

/** The Oort mark: the app icon's ring + node dot — the same art as the
 *  navbar mark and public/favicon.svg, cropped to the mark itself. The
 *  AI surfaces use it as their identity, and it spins while a turn is
 *  working (the "generation in flight" indicator). */
export function OortMark({ working, size = 18 }: { working?: boolean; size?: number }) {
  const gid = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <svg
      width={size}
      height={size}
      viewBox="323 310 634 634"
      aria-hidden
      className={`flex-none ${working ? 'animate-[spin_2.4s_linear_infinite]' : ''}`}
    >
      <defs>
        <linearGradient id={`oort-ring-${gid}`} gradientUnits="userSpaceOnUse" x1="400" y1="310" x2="850" y2="790">
          <stop offset="0" stopColor="#d9cdff" />
          <stop offset="0.45" stopColor="#9d7bff" />
          <stop offset="0.78" stopColor="#7c4dff" />
          <stop offset="1" stopColor="#6432f0" />
        </linearGradient>
      </defs>
      <circle cx="627" cy="627" r="269" fill="none" stroke={`url(#oort-ring-${gid})`} strokeWidth="70" />
      <circle cx="912" cy="624" r="45" fill="#ffffff" />
    </svg>
  );
}

/** The "generation in flight" glare: a sweeping light band over a quiet
 *  block (the AI Elements Shimmer technique, as shape placeholders). */
export const GLARE_STYLE: CSSProperties = {
  backgroundImage:
    'linear-gradient(90deg, #0000 calc(50% - 44px), rgb(255 255 255 / 0.16) 50%, #0000 calc(50% + 44px)),' +
    'linear-gradient(rgb(255 255 255 / 0.08), rgb(255 255 255 / 0.08))',
  backgroundSize: '250% 100%, auto',
  backgroundRepeat: 'no-repeat, padding-box',
};

export function GlareBlock({ className }: { className: string }) {
  return (
    <motion.span
      aria-hidden
      className={`block ${className}`}
      style={GLARE_STYLE}
      initial={{ backgroundPosition: '100% center' }}
      animate={{ backgroundPosition: '0% center' }}
      transition={{ duration: 2, ease: 'linear', repeat: Number.POSITIVE_INFINITY }}
    />
  );
}
