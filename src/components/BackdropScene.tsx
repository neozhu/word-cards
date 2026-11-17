import { useState, type MouseEvent } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { CategoryId } from '../data/vocabData';

interface BackdropSceneProps {
  category: CategoryId;
  cardTint?: string;
}

interface ThemePalette {
  topLeft: string;
  topRight: string;
  bottomCenter: string;
  accentA: string;
  accentB: string;
  accentC: string;
}

const CATEGORY_PALETTES: Partial<Record<CategoryId, ThemePalette>> & { all: ThemePalette } = {
  all: {
    topLeft: 'rgba(199, 210, 254, 0.55)', // soft indigo
    topRight: 'rgba(253, 230, 138, 0.5)', // sunlit butter
    bottomCenter: 'rgba(186, 230, 253, 0.45)', // sky mist
    accentA: '#818CF8',
    accentB: '#FBBF24',
    accentC: '#38BDF8',
  },
  animals: {
    topLeft: 'rgba(167, 243, 208, 0.52)', // meadow mint
    topRight: 'rgba(254, 240, 138, 0.52)', // warm sunshine
    bottomCenter: 'rgba(186, 230, 253, 0.42)', // soft pond blue
    accentA: '#34D399',
    accentB: '#FBBF24',
    accentC: '#60A5FA',
  },
  fruits: {
    topLeft: 'rgba(254, 205, 211, 0.55)', // berry blush
    topRight: 'rgba(254, 215, 170, 0.55)', // peach citrus
    bottomCenter: 'rgba(254, 240, 138, 0.42)', // lemon cream
    accentA: '#FB7185',
    accentB: '#FB923C',
    accentC: '#4ADE80',
  },
  vehicles: {
    topLeft: 'rgba(186, 230, 253, 0.58)', // clear sky
    topRight: 'rgba(199, 210, 254, 0.5)', // twilight periwinkle
    bottomCenter: 'rgba(224, 242, 254, 0.5)', // cloud mist
    accentA: '#38BDF8',
    accentB: '#818CF8',
    accentC: '#F59E0B',
  },
  expressions: {
    topLeft: 'rgba(253, 230, 138, 0.58)', // cheerful yellow
    topRight: 'rgba(251, 207, 232, 0.5)', // rosy pink
    bottomCenter: 'rgba(254, 215, 170, 0.45)', // warm apricot
    accentA: '#F59E0B',
    accentB: '#F472B6',
    accentC: '#818CF8',
  },
};

function PlayfulCloud({ side }: { side: 'left' | 'right' }) {
  const [position, setPosition] = useState({
    left: side === 'left' ? 3 : 78,
    top: 84,
    tilt: 0,
  });
  const reduceMotion = useReducedMotion();

  const moveCloud = (event: MouseEvent<HTMLButtonElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const currentLeft = (bounds.left / window.innerWidth) * 100;
    const currentTop = bounds.top;
    const horizontal = event.detail === 0
      ? (Math.random() < 0.5 ? -1 : 1)
      : (event.clientX < bounds.left + bounds.width / 2 ? 1 : -1);
    const vertical = event.detail === 0
      ? (Math.random() < 0.5 ? -1 : 1)
      : (event.clientY < bounds.top + bounds.height / 2 ? 1 : -1);
    const minLeft = side === 'left' ? 3 : 58;
    const maxLeft = side === 'left' ? 23 : 78;
    const distance = 8 + Math.random() * 5;
    let left = Math.max(minLeft, Math.min(maxLeft, currentLeft + horizontal * distance));
    if (Math.abs(left - currentLeft) < 2) {
      left = Math.max(minLeft, Math.min(maxLeft, currentLeft - horizontal * distance));
    }
    let top = Math.max(84, Math.min(128, currentTop + vertical * (12 + Math.random() * 15)));
    if (Math.abs(top - currentTop) < 3) {
      top = Math.max(84, Math.min(128, currentTop - vertical * 15));
    }
    const tilt = (left > currentLeft ? 1 : -1) * (4 + Math.random() * 4);
    setPosition({ left, top, tilt });
  };

  return (
    <motion.button
      type="button"
      aria-label={`Move ${side} cloud`}
      initial={false}
      animate={{ left: `${position.left}%`, top: position.top, rotate: [0, position.tilt, 0] }}
      transition={{ duration: reduceMotion ? 0 : 0.65, ease: 'easeInOut' }}
      onClick={moveCloud}
      className="absolute pointer-events-auto flex min-h-11 w-16 sm:w-28 lg:w-36 items-center cursor-pointer rounded-full text-white/80 drop-shadow-[0_6px_18px_rgba(15,23,42,0.06)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
    >
      <motion.svg
        viewBox="0 0 160 80"
        aria-hidden="true"
        animate={reduceMotion ? undefined : { y: [0, -5, 0] }}
        transition={{ duration: side === 'left' ? 5 : 6, repeat: Infinity, ease: 'easeInOut' }}
        className="w-full"
      >
        <path
          d="M36 66h86a22 22 0 0 0 4-43.6A28 28 0 0 0 72 16a24 24 0 0 0-38 14A18 18 0 0 0 36 66Z"
          fill="currentColor"
        />
      </motion.svg>
    </motion.button>
  );
}

export function BackdropScene({ category, cardTint }: BackdropSceneProps) {
  const palette = CATEGORY_PALETTES[category] ?? CATEGORY_PALETTES.all;

  return (
    <>
    <div
      aria-hidden="true"
      className="fixed inset-0 overflow-hidden pointer-events-none z-0 select-none"
    >
      {/* Warm Sunlit Ambient Color Blobs */}
      <motion.div
        animate={{ backgroundColor: palette.topLeft }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className="absolute -top-32 -left-28 w-[440px] h-[440px] sm:w-[580px] sm:h-[580px] rounded-full blur-[90px]"
      />
      <motion.div
        animate={{ backgroundColor: palette.topRight }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className="absolute -top-24 -right-28 w-[400px] h-[400px] sm:w-[560px] sm:h-[560px] rounded-full blur-[90px]"
      />
      <motion.div
        animate={{ backgroundColor: palette.bottomCenter }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className="absolute -bottom-36 left-1/2 -translate-x-1/2 w-[520px] h-[380px] sm:w-[760px] sm:h-[440px] rounded-full blur-[100px]"
      />

      {/* Subtle Card-Reactive Studio Glow Behind Center Deck */}
      {cardTint && (
        <motion.div
          animate={{ backgroundColor: cardTint }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[360px] h-[360px] sm:w-[500px] sm:h-[500px] rounded-full opacity-55 blur-[95px]"
        />
      )}

      {/* Tactile Stationery Dot Grid Overlay */}
      <div className="absolute inset-0 studio-dot-overlay" />

      {/* Soft Paper-Cut Horizon Wave Along Bottom */}
      <svg
        viewBox="0 0 1440 180"
        preserveAspectRatio="none"
        className="absolute bottom-0 left-0 w-full h-24 sm:h-36 opacity-85"
      >
        <path
          d="M0,96 C260,150 480,36 760,84 C1040,132 1260,54 1440,86 L1440,180 L0,180 Z"
          fill="rgba(255, 255, 255, 0.52)"
        />
        <path
          d="M0,126 C310,80 610,164 940,116 C1160,84 1320,122 1440,104 L1440,180 L0,180 Z"
          fill="rgba(255, 255, 255, 0.82)"
        />
      </svg>

      {/* Left Margin Playful Sparkle & Orbit Ring (Desktop / Tablet) */}
      <motion.div
        animate={{ y: [0, -10, 0], rotate: [0, 10, 0] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        className="hidden md:flex flex-col items-center gap-6 absolute top-[38%] left-8 lg:left-20"
      >
        <svg viewBox="0 0 48 48" className="w-10 h-10 opacity-45">
          <path
            d="M24 3l4.6 14.4L43 22l-14.4 4.6L24 41l-4.6-14.4L5 22l14.4-4.6L24 3z"
            fill={palette.accentB}
          />
        </svg>
        <div
          className="w-14 h-14 rounded-full border-[3px] border-dashed opacity-30"
          style={{ borderColor: palette.accentA }}
        />
      </motion.div>

      {/* Right Margin Floating Confetti Shapes (Desktop / Tablet) */}
      <motion.div
        animate={{ y: [0, 12, 0], rotate: [0, -8, 0] }}
        transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
        className="hidden md:flex flex-col items-center gap-7 absolute top-[34%] right-8 lg:right-20"
      >
        <svg viewBox="0 0 48 48" className="w-9 h-9 opacity-45">
          <circle cx="24" cy="24" r="14" fill="none" stroke={palette.accentC} strokeWidth="5" />
          <circle cx="24" cy="24" r="4" fill={palette.accentB} />
        </svg>
        <svg viewBox="0 0 48 48" className="w-8 h-8 opacity-40">
          <path
            d="M24 4l5.2 10.6L41 16.3l-8.5 8.3 2 11.7L24 30.8l-10.5 5.5 2-11.7L7 16.3l11.8-1.7L24 4z"
            fill={palette.accentA}
          />
        </svg>
      </motion.div>

      {/* Bottom Corner Micro Accents (Tablet / Desktop Margins) */}
      <motion.svg
        viewBox="0 0 40 40"
        animate={{ rotate: [0, 15, 0], scale: [1, 1.08, 1] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
        className="hidden sm:block absolute bottom-12 left-16 w-8 h-8 opacity-45"
      >
        <path
          d="M20 2l3.8 12.2L36 18l-12.2 3.8L20 34l-3.8-12.2L4 18l12.2-3.8L20 2z"
          fill={palette.accentA}
        />
      </motion.svg>

      <motion.svg
        viewBox="0 0 40 40"
        animate={{ y: [0, -6, 0], rotate: [0, -12, 0] }}
        transition={{ duration: 6.5, repeat: Infinity, ease: 'easeInOut' }}
        className="hidden sm:block absolute bottom-14 right-16 w-8 h-8 opacity-45"
      >
        <rect
          x="9"
          y="9"
          width="22"
          height="22"
          rx="7"
          fill="none"
          stroke={palette.accentB}
          strokeWidth="4.5"
        />
      </motion.svg>
    </div>
    <div className="fixed inset-0 z-20 overflow-hidden pointer-events-none">
      <PlayfulCloud side="left" />
      <PlayfulCloud side="right" />
    </div>
    </>
  );
}
