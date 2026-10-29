import { useEffect, useRef } from 'react';
import {
  DefaultContextMenu,
  TldrawUiMenuGroup,
  TldrawUiMenuItem,
  useContainer,
  useMenuIsOpen,
  useEditor,
  useValue,
} from 'tldraw';
import type { TLUiContextMenuProps } from 'tldraw';
import { isTauri } from '@tauri-apps/api/core';
import { useIconFinderStore } from '@/stores/icon-finder-store';
import { useAiCanvasPromptStore } from '@/features/ai/canvas-prompt-store';
import { OortContextMenuContentWithPdf } from '@/components/global/canvas/ExportAsMenu';

/**
 * The stock canvas context menu with a PDF row injected into its "Export as"
 * submenu (tldraw ships SVG / PNG / Transparent; see ExportAsMenu for the
 * extension copy), plus this app's icon finder as its own insert-action
 * group (not a tool; it opens the search dialog). Hidden in view mode the
 * same way every other editing affordance is hidden there.
 * The kbd hint needs tldraw's lowercase binding grammar — "ctrl+alt+i" —
 * which it renders as Ctrl + Alt + I (⌘⌥I on mac).
 */
function OortContextMenuContent() {
  const editor = useEditor();
  const readonly = useValue('canvas is readonly', () => editor.getIsReadonly(), [editor]);
  return (
    <>
      <OortContextMenuContentWithPdf />
      {isTauri() && (
        <TldrawUiMenuGroup id="oort-ai">
          {/* Opens the anchored floating prompt at the right-click spot; the
              geometry was already snapshotted by the canvas shell's capture
              listener the moment this right-click happened. Deliberately kept
              free of blur/pointer handling (see ContextBlurGuard) — the card
              mounts after this menu closes. */}
          <TldrawUiMenuItem
            id="oort-ai-help"
            label="AI help…"
            onSelect={() => {
              useAiCanvasPromptStore.getState().openPrompt();
            }}
          />
        </TldrawUiMenuGroup>
      )}
      {!readonly && (
        <TldrawUiMenuGroup id="oort-insert">
          <TldrawUiMenuItem
            id="oort-icon-finder"
            label="Icon finder"
            kbd="ctrl+alt+i"
            onSelect={() => useIconFinderStore.getState().setOpen(true)}
          />
        </TldrawUiMenuGroup>
      )}
    </>
  );
}

/**
 * Wraps tldraw's stock canvas context menu to fix its once-only bug.
 *
 * tldraw 3.15.6 builds the context menu on radix-ui and gates the radix
 * `Portal`+`Content` pair behind its own open-menu signal (`{isOpen && …}`).
 * While any menu is open, tldraw's `MenuClickCapture` overlay intercepts the
 * next `pointerdown` and clears that signal *during React's synchronous
 * dispatch*. The radix content unmounts mid-event, so radix's own bubble-phase
 * `pointerdown`-outside dismissal (registered on `document`) dies before it
 * can run: radix's internal `open` state is stuck `true`. Every subsequent
 * `contextmenu` then calls `setOpen(true)` on an already-`true` controlled
 * value, which radix's `useControllableState` treats as a no-op — the change
 * callback never fires and the menu never opens again.
 *
 * Radix's `Menu` root closes itself cleanly on `window` blur events
 * (`handleBlur → onOpenChange(false)`). So while the context menu is open, we
 * dispatch a synthetic `blur` at the `pointerdown` capture phase — before React
 * delegation and the overlay race — which resets radix's internal state to
 * closed. The very same right-click can then re-open it for real.
 *
 * One residual collision: closing unmounts the content and radix's FocusScope
 * schedules a `setTimeout(0)` restore that refocuses the canvas container. On
 * a right-click-elsewhere the same tick also *re-opens* the menu (relocation)
 * and the new content autofocuses; when the deferred restore lands after that
 * autofocus it yanks focus back out, and radix's focus-outside dismissal then
 * closes the menu again. For right-button pointerdowns (exactly the relocate
 * path) we therefore swallow `focus()` on the container for a short window so
 * the deferred restore cannot undo the relocation. Left-button dismissals keep
 * the restore so the canvas regains focus as before. The synthetic blur
 * carries no trusted focus change, nothing on the page tracks window blur
 * outside radix's menu roots, and every other open menu was already being
 * closed by the same pointerdown (tldraw clears the whole menu registry), so
 * their final state is unchanged.
 */

/** How long `container.focus()` stays swallowed after a right-button
 *  pointerdown. Must comfortably outlast radix's `setTimeout(0)`-deferred
 *  FocusScope restore, which can land tens of milliseconds later under load. */
const RELOCATE_FOCUS_GRACE_MS = 250;

export function StableContextMenu(props: TLUiContextMenuProps) {
	return (
		<>
			<DefaultContextMenu {...props}>
				<OortContextMenuContent />
			</DefaultContextMenu>
			<ContextBlurGuard />
		</>
	);
}

function ContextBlurGuard() {
	// Mirror-subscription only: same open-menu id, no side-effect callback.
	const [isOpen] = useMenuIsOpen('context menu');
	const container = useContainer();
	const suppression = useRef<{ original: HTMLElement['focus']; timer: number } | null>(null);

	useEffect(() => {
		if (!isOpen) return;

		const onPointerDownCapture = (e: PointerEvent) => {
			// Let the open menu handle its own clicks: item activation is
			// pointerdown → pointerup → onSelect, and resetting radix at
			// pointerdown unmounts the content first, killing every action.
			// Exempt the context menu content itself and its submenu panels
			// (which live in separate portals with the `context-menu-sub.*`
			// testids).
			const target = e.target instanceof Element ? e.target : null;
			if (target && target.closest('[data-testid="context-menu"], [data-testid^="context-menu-sub."][data-testid$="-content"]')) {
				return;
			}

			// Reset radix's internal open state so the upcoming `contextmenu` is
			// a real false→true transition instead of a stuck no-op.
			window.dispatchEvent(new Event('blur'));

			// Relocation: the same right-click closes and immediately re-opens
			// the menu with autofocus. radix's FocusScope restore of the old
			// content — a `setTimeout(0)` that refocuses the canvas container —
			// can land after that autofocus, yank focus out again, and then
			// radix's focus-outside dismissal closes the just-reopened menu.
			// Swallow `focus()` on the container so that restore cannot run.
			// The window deliberately outlives the menu's own open/close flips —
			// it is NOT undone by this effect's cleanup, only by its timeout
			// (or force-restored when the component unmounts).
			if (e.button !== 2 || suppression.current) return;
			const original = container.focus.bind(container);
			container.focus = () => {};
			suppression.current = {
				original,
				timer: window.setTimeout(() => {
					suppression.current = null;
					container.focus = original;
				}, RELOCATE_FOCUS_GRACE_MS),
			};
		};

		window.addEventListener('pointerdown', onPointerDownCapture, { capture: true });
		return () => {
			window.removeEventListener('pointerdown', onPointerDownCapture, { capture: true });
		};
	}, [isOpen, container]);

	// Force-restore on unmount so a stray suppression can never outlive us.
	useEffect(() => {
		return () => {
			const s = suppression.current;
			if (s) {
				clearTimeout(s.timer);
				suppression.current = null;
				container.focus = s.original;
			}
		};
	}, [container]);

	return null;
}
