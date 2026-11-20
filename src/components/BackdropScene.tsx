import { memo, useEffect, useState, type MouseEvent } from 'react';
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

const CATEGORY_PALETTES: Record<CategoryId, ThemePalette> = {
  all: {
    topLeft: 'rgba(199, 210, 254, 0.55)',
    topRight: 'rgba(253, 230, 138, 0.5)',
    bottomCenter: 'rgba(186, 230, 253, 0.45)',
    accentA: '#818CF8',
    accentB: '#FBBF24',
    accentC: '#38BDF8',
  },
  animals: {
    topLeft: 'rgba(167, 243, 208, 0.52)',
    topRight: 'rgba(254, 240, 138, 0.52)',
    bottomCenter: 'rgba(186, 230, 253, 0.42)',
    accentA: '#34D399',
    accentB: '#FBBF24',
    accentC: '#60A5FA',
  },
  fruits: {
    topLeft: 'rgba(254, 205, 211, 0.55)',
    topRight: 'rgba(254, 215, 170, 0.55)',
    bottomCenter: 'rgba(254, 240, 138, 0.42)',
    accentA: '#FB7185',
    accentB: '#FB923C',
    accentC: '#4ADE80',
  },
  vehicles: {
    topLeft: 'rgba(186, 230, 253, 0.58)',
    topRight: 'rgba(199, 210, 254, 0.5)',
    bottomCenter: 'rgba(224, 242, 254, 0.5)',
    accentA: '#38BDF8',
    accentB: '#818CF8',
    accentC: '#F59E0B',
  },
  expressions: {
    topLeft: 'rgba(253, 230, 138, 0.58)',
    topRight: 'rgba(251, 207, 232, 0.5)',
    bottomCenter: 'rgba(254, 215, 170, 0.45)',
    accentA: '#F59E0B',
    accentB: '#F472B6',
    accentC: '#818CF8',
  },
  food: {
    topLeft: 'rgba(254, 215, 170, 0.56)',
    topRight: 'rgba(253, 230, 138, 0.52)',
    bottomCenter: 'rgba(254, 202, 202, 0.42)',
    accentA: '#FB923C',
    accentB: '#FBBF24',
    accentC: '#F87171',
  },
  body: {
    topLeft: 'rgba(251, 207, 232, 0.54)',
    topRight: 'rgba(254, 215, 170, 0.48)',
    bottomCenter: 'rgba(221, 214, 254, 0.45)',
    accentA: '#F472B6',
    accentB: '#FB7185',
    accentC: '#A78BFA',
  },
  colors: {
    topLeft: 'rgba(221, 214, 254, 0.56)',
    topRight: 'rgba(251, 207, 232, 0.5)',
    bottomCenter: 'rgba(186, 230, 253, 0.48)',
    accentA: '#8B5CF6',
    accentB: '#EC4899',
    accentC: '#38BDF8',
  },
  numbers: {
    topLeft: 'rgba(191, 219, 254, 0.58)',
    topRight: 'rgba(199, 210, 254, 0.5)',
    bottomCenter: 'rgba(204, 251, 241, 0.45)',
    accentA: '#3B82F6',
    accentB: '#6366F1',
    accentC: '#14B8A6',
  },
  family: {
    topLeft: 'rgba(252, 231, 243, 0.62)',
    topRight: 'rgba(254, 240, 138, 0.48)',
    bottomCenter: 'rgba(254, 205, 211, 0.46)',
    accentA: '#EC4899',
    accentB: '#F59E0B',
    accentC: '#FB7185',
  },
  objects: {
    topLeft: 'rgba(153, 246, 228, 0.5)',
    topRight: 'rgba(186, 230, 253, 0.5)',
    bottomCenter: 'rgba(254, 243, 199, 0.46)',
    accentA: '#14B8A6',
    accentB: '#0EA5E9',
    accentC: '#FBBF24',
  },
  nature: {
    topLeft: 'rgba(187, 247, 208, 0.54)',
    topRight: 'rgba(186, 230, 253, 0.5)',
    bottomCenter: 'rgba(254, 249, 195, 0.46)',
    accentA: '#22C55E',
    accentB: '#38BDF8',
    accentC: '#EAB308',
  },
};

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, [query]);

  return matches;
}

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
      tabIndex={-1}
      aria-hidden="true"
      initial={false}
      animate={{ left: `${position.left}%`, top: position.top, rotate: [0, position.tilt, 0] }}
      transition={{ duration: reduceMotion ? 0 : 0.65, ease: 'easeInOut' }}
      onClick={moveCloud}
      className="absolute pointer-events-auto flex min-h-11 w-28 lg:w-36 items-center cursor-pointer rounded-full text-white/80 drop-shadow-[0_6px_18px_rgba(15,23,42,0.06)]"
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

const radialWashStyle = {
  backgroundImage: 'radial-gradient(closest-side, currentColor 0%, transparent 100%)',
};

export const BackdropScene = memo(function BackdropScene({ category, cardTint }: BackdropSceneProps) {
  const palette = CATEGORY_PALETTES[category] ?? CATEGORY_PALETTES.all;
  const reduceMotion = useReducedMotion();
  const isSm = useMediaQuery('(min-width: 640px)');
  const isMd = useMediaQuery('(min-width: 768px)');

  return (
    <>
      <div
        aria-hidden="true"
        className="fixed inset-0 overflow-hidden pointer-events-none z-0 select-none"
      >
        {/* Warm Sunlit Ambient Color Washes (radial gradients avoid costly full-screen blur filters) */}
        <motion.div
          animate={{ color: palette.topLeft }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          style={radialWashStyle}
          className="absolute -top-44 -left-40 w-[560px] h-[560px] sm:w-[760px] sm:h-[760px] rounded-full"
        />
        <motion.div
          animate={{ color: palette.topRight }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          style={radialWashStyle}
          className="absolute -top-36 -right-40 w-[520px] h-[520px] sm:w-[740px] sm:h-[740px] rounded-full"
        />
        <motion.div
          animate={{ color: palette.bottomCenter }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          style={radialWashStyle}
          className="absolute -bottom-52 left-1/2 -translate-x-1/2 w-[680px] h-[520px] sm:w-[960px] sm:h-[600px] rounded-full"
        />

        {/* Subtle Card-Reactive Studio Glow Behind Center Deck */}
        {cardTint && (
          <motion.div
            animate={{ color: cardTint }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            style={radialWashStyle}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px] sm:w-[680px] sm:h-[680px] rounded-full opacity-55"
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

        {/* Left & Right Margin Ornaments (Desktop / Tablet only) */}
        {isMd && (
          <>
            <motion.div
              animate={reduceMotion ? undefined : { y: [0, -10, 0], rotate: [0, 10, 0] }}
              transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
              className="flex flex-col items-center gap-6 absolute top-[38%] left-8 lg:left-20"
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

            <motion.div
              animate={reduceMotion ? undefined : { y: [0, 12, 0], rotate: [0, -8, 0] }}
              transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
              className="flex flex-col items-center gap-7 absolute top-[34%] right-8 lg:right-20"
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
          </>
        )}

        {/* Bottom Corner Micro Accents (Tablet / Desktop Margins) */}
        {isSm && (
          <>
            <motion.svg
              viewBox="0 0 40 40"
              animate={reduceMotion ? undefined : { rotate: [0, 15, 0], scale: [1, 1.08, 1] }}
              transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute bottom-12 left-16 w-8 h-8 opacity-45"
            >
              <path
                d="M20 2l3.8 12.2L36 18l-12.2 3.8L20 34l-3.8-12.2L4 18l12.2-3.8L20 2z"
                fill={palette.accentA}
              />
            </motion.svg>

            <motion.svg
              viewBox="0 0 40 40"
              animate={reduceMotion ? undefined : { y: [0, -6, 0], rotate: [0, -12, 0] }}
              transition={{ duration: 6.5, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute bottom-14 right-16 w-8 h-8 opacity-45"
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
          </>
        )}
      </div>

      {isMd && (
        <div aria-hidden="true" className="hidden md:block fixed inset-0 z-[5] overflow-hidden pointer-events-none">
          <PlayfulCloud side="left" />
          <PlayfulCloud side="right" />
        </div>
      )}
    </>
  );
});
