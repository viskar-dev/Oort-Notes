import { afterEach, describe, expect, it } from 'vitest';
import { appCombo, isApple, isLinux, kbdHint, setApplePlatformOverride } from './platform';

afterEach(() => setApplePlatformOverride(null));

const ev = (o: object) => o as KeyboardEvent;

describe('appCombo', () => {
  it('accepts Ctrl and Cmd on every platform (both fire everywhere)', () => {
    expect(appCombo(ev({ ctrlKey: true, metaKey: false }))).toBe(true);
    expect(appCombo(ev({ ctrlKey: false, metaKey: true }))).toBe(true);
    expect(appCombo(ev({ ctrlKey: true, metaKey: true }))).toBe(true);
    expect(appCombo(ev({ ctrlKey: false, metaKey: false }))).toBe(false);
  });

  it('never fires for AltGraph — the AltGr stack on Windows/Linux layouts', () => {
    // é/§-style compositions arrive as Ctrl+Alt plus AltGraph set
    expect(appCombo(ev({ ctrlKey: true, metaKey: false, getModifierState: (m: string) => m === 'AltGraph' }))).toBe(
      false,
    );
  });

  it('treats a missing getModifierState engine as plain modifiers', () => {
    const { getModifierState: _omit, plain } = { plain: { ctrlKey: true, metaKey: false } } as Record<string, unknown>;
    expect(appCombo(plain as KeyboardEvent)).toBe(true);
    void _omit;
  });
});

describe('platform detection', () => {
  it('honors the override seam (node env has no mac UA)', () => {
    setApplePlatformOverride(true);
    expect(isApple()).toBe(true);
    setApplePlatformOverride(false);
    expect(isApple()).toBe(false);
    expect(isLinux()).toBe(false);
    setApplePlatformOverride(null);
  });
});

describe('kbdHint', () => {
  it('renders the Ctrl wording off Apple platforms', () => {
    setApplePlatformOverride(false);
    expect(kbdHint('cmd+alt+a')).toBe('Ctrl+Alt+A');
    expect(kbdHint('cmd+k')).toBe('Ctrl+K');
    expect(kbdHint('ctrl+shift+s')).toBe('Ctrl+Shift+S');
  });

  it('renders mac glyphs in menu-bar order (⌃ ⇧ ⌥ ⌘)', () => {
    setApplePlatformOverride(true);
    expect(kbdHint('cmd+alt+a')).toBe('⌥⌘A');
    expect(kbdHint('cmd+k')).toBe('⌘K');
    expect(kbdHint('ctrl+shift+z')).toBe('⌃⇧Z');
    expect(kbdHint('cmd+meta+alt+v')).toBe('⌥⌘V');
  });

  it('renders a bare key without a "+"', () => {
    setApplePlatformOverride(false);
    expect(kbdHint('k')).toBe('K');
    setApplePlatformOverride(true);
    expect(kbdHint('k')).toBe('K');
  });
});
