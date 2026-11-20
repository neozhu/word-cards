import { useState } from 'react';

interface EmojiIconProps {
  src: string;
  fallbackEmoji: string;
  alt?: string;
  className?: string;
  fallbackClassName?: string;
  multiFallbackClassName?: string;
}

const graphemeSegmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter('en', { granularity: 'grapheme' })
    : null;

function countGraphemes(text: string): number {
  if (!text) return 0;
  if (graphemeSegmenter) {
    let count = 0;
    for (const _ of graphemeSegmenter.segment(text)) {
      count += 1;
      if (count > 1) return count;
    }
    return count;
  }
  return Array.from(text).length;
}

export function EmojiIcon({
  src,
  fallbackEmoji,
  alt = '',
  className = 'w-24 h-24 object-contain',
  fallbackClassName = 'text-6xl leading-none',
  multiFallbackClassName,
}: EmojiIconProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = failedSrc === src;

  if (!src || failed) {
    const isMulti = countGraphemes(fallbackEmoji) > 1;
    const resolvedFallbackClass = isMulti
      ? multiFallbackClassName ?? `${fallbackClassName} scale-[0.65] whitespace-nowrap`
      : fallbackClassName;

    return (
      <span
        className={`select-none inline-flex items-center justify-center ${resolvedFallbackClass}`}
        role={alt ? 'img' : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
      >
        {fallbackEmoji}
      </span>
    );
  }

  return (
    <img
      src={src.startsWith('/') && !src.startsWith('//')
        ? `${import.meta.env.BASE_URL}${src.slice(1)}`
        : src}
      alt={alt}
      width={256}
      height={256}
      decoding="async"
      aria-hidden={alt ? undefined : true}
      draggable={false}
      referrerPolicy="no-referrer"
      onError={() => setFailedSrc(src)}
      className={`select-none pointer-events-none drop-shadow-sm ${className}`}
    />
  );
}
