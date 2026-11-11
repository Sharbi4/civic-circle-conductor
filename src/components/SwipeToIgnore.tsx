import { useRef, type ReactNode } from 'react';
import { isIgnoreSwipe } from '@/lib/inbox.shared';

export function SwipeToIgnore({ children, onIgnore, disabled }: { children: ReactNode; onIgnore: () => void; disabled: boolean }) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return <div className="touch-pan-y" onPointerDown={(e) => { if (!disabled) start.current = { x: e.clientX, y: e.clientY }; }} onPointerCancel={() => { start.current = null; }} onPointerUp={(e) => {
    const origin = start.current; start.current = null;
    if (origin && !disabled && isIgnoreSwipe(e.clientX - origin.x, e.clientY - origin.y)) onIgnore();
  }}>{children}</div>;
}