import { AnimatePresence, motion } from 'motion/react';

export interface BurstItem {
  id: number;
  kind: 'star' | 'emoji';
  x?: number;
  y?: number;
}

interface ParticleBurstProps {
  bursts: BurstItem[];
}

const ANGLES = [18, 62, 108, 152, 198, 242, 288, 332];
const COLORS = ['#F59E0B', '#10B981', '#0EA5E9', '#FB7185', '#6366F1'];

export function ParticleBurst({ bursts }: ParticleBurstProps) {
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-visible z-30"
      aria-hidden="true"
    >
      <AnimatePresence>
        {bursts.map((burst) => (
          <div
            key={burst.id}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          >
            {ANGLES.map((deg, idx) => {
              const rad = (deg * Math.PI) / 180;
              const startDist = burst.kind === 'star' ? 46 : 36;
              const endDist =
                burst.kind === 'star'
                  ? 122 + (idx % 2) * 28
                  : 88 + (idx % 2) * 20;
              const sx = Math.cos(rad) * startDist;
              const sy = Math.sin(rad) * startDist;
              const tx = Math.cos(rad) * endDist;
              const ty = Math.sin(rad) * endDist;
              const color = COLORS[idx % COLORS.length];
              const size = burst.kind === 'star' ? 14 : 11;
              const isSparkle = idx % 2 === 0;

              return (
                <motion.svg
                  key={`${burst.id}-${deg}`}
                  viewBox="0 0 24 24"
                  width={size}
                  height={size}
                  initial={{ opacity: 0.95, scale: 0.5, x: sx, y: sy, rotate: 0 }}
                  animate={{
                    opacity: 0,
                    scale: [0.5, 1.18, 0.35],
                    x: tx,
                    y: ty,
                    rotate: idx % 2 === 0 ? 75 : -75,
                  }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.52, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                >
                  {isSparkle ? (
                    <path
                      d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4L12 2z"
                      fill={color}
                    />
                  ) : (
                    <circle cx="12" cy="12" r="7" fill={color} />
                  )}
                </motion.svg>
              );
            })}
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
