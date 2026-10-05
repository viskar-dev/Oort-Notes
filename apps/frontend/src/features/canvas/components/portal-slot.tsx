import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

/**
 * Renders tldraw's native UI components into a slot in our own top bar.
 * The React tree (and therefore the editor/UI context) stays inside
 * <Tldraw>; only the DOM moves via portal.
 */
export function PortalSlot({
  slotRef,
  children,
}: {
  slotRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted || !slotRef.current) return null;
  return createPortal(children, slotRef.current);
}
