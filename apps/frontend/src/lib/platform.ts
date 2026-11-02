/**
 * Cross-platform keyboard support: platform detection, one shared detector
 * for app-level modifier combos, and shortcut-hint rendering. Windows and
 * Linux use Ctrl; macOS conventions are ⌘ (primary) and ⌥ — every binding
 * we register accepts both Ctrl and Cmd everywhere, and only the hint layer
 * differs per platform. tldraw's own shortcut system does the same thing
 * internally (see tldraw.dev "Actions → keyboard shortcuts").
 */

let appleOverride: boolean | null = null;

/** Testing seam (node-env units) and future exotic embeds: force the Apple
 *  classification instead of sniffing the UA. */
export function setApplePlatformOverride(value: boolean | null | undefined) {
  appleOverride = value ?? null;
}

/** True on Apple platforms (macOS / iOS): hints render ⌘/⌥ glyphs and the
 *  conventional primary modifier is Cmd. */
export function isApple(): boolean {
  if (appleOverride !== null) return appleOverride;
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
}

/** Same classification under the name existing call sites use. */
export const isMac = isApple;

/** Linux (used by hint wording paths if a platform-specific label ever
 *  needs to differ from Windows). */
export function isLinux(): boolean {
  if (typeof navigator === 'undefined') return false;
  return !isApple() && /Linux/.test(navigator.userAgent);
}

/**
 * Does this key event carry an app-level modifier combo? Ctrl and Cmd are
 * both accepted on every platform (a Ctrl remap or a Mac terminal-style
 * remap keeps working). AltGraph is excluded: on Windows/Linux the AltGr
 * modifier IS Ctrl+Alt on the real modifier stack — every additional
 * character international layouts type (é, §, …) arrives as AltGr+key, and
 * those must never trigger app shortcuts. (On macOS AltGraph doesn't exist;
 * Option dead keys are already handled by our physical-key `e.code` checks.)
 */
export function appCombo(
  e: Pick<KeyboardEvent, 'metaKey' | 'ctrlKey' | 'getModifierState'>,
): boolean {
  if (e.getModifierState?.('AltGraph')) return false;
  return e.metaKey || e.ctrlKey;
}

/**
 * Hint for a tldraw-grammar binding string: 'cmd+alt+a' renders '⌥⌘A' on
 * Apple platforms and 'Ctrl+Alt+A' elsewhere. Glyph order follows the
 * macOS menu-bar convention (⌃ ⇧ ⌥ ⌘).
 */
export function kbdHint(sc: string): string {
  const parts = sc.split('+').map((p) => p.toLowerCase());
  const key = (parts[parts.length - 1] ?? '').toUpperCase();
  const has = (m: string) => parts.includes(m);
  if (isApple()) {
    const glyphs = [
      has('ctrl') ? '⌃' : '',
      has('shift') ? '⇧' : '',
      has('alt') ? '⌥' : '',
      has('cmd') || has('meta') ? '⌘' : '',
    ].join('');
    return `${glyphs}${key}`;
  }
  const mods = [
    has('ctrl') || has('cmd') || has('meta') ? 'Ctrl' : '',
    has('alt') ? 'Alt' : '',
    has('shift') ? 'Shift' : '',
  ].filter(Boolean);
  return mods.length > 0 ? `${mods.join('+')}+${key}` : key;
}
