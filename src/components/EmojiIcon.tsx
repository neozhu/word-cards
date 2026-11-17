import { useState } from 'react';

interface EmojiIconProps {
  src: string;
  fallbackEmoji: string;
  alt?: string;
  className?: string;
  fallbackClassName?: string;
}

export function EmojiIcon({
  src,
  fallbackEmoji,
  alt = '',
  className = 'w-24 h-24 object-contain',
  fallbackClassName = 'text-6xl leading-none',
}: EmojiIconProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span
        className={`select-none inline-flex items-center justify-center ${fallbackClassName}`}
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
      src={src}
      alt={alt}
      aria-hidden={alt ? undefined : true}
      draggable={false}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`select-none pointer-events-none drop-shadow-sm ${className}`}
    />
  );
}
