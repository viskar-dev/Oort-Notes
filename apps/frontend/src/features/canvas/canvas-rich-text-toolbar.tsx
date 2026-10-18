import { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor as TiptapEditor } from '@tiptap/core';
import {
  preventDefault,
  DefaultRichTextToolbar,
  DefaultRichTextToolbarContent,
  TldrawUiButton,
  TldrawUiButtonIcon,
  TldrawUiInput,
  TldrawUiToolbarButton,
  track,
  useEditor,
  useValue,
} from 'tldraw';
import {
  FloatingPopover,
  getColorValue,
  hasActiveTextSelection,
  wordColorValue,
} from '@/features/canvas/components/contextual-style-panel';
import { useRichTextTick } from '@/features/canvas/hooks/use-rich-text-tick';
import { ALL_COLORS, useUiPresetStore } from '@/features/presets/preset-config';

const colorTitle = (id: string) =>
  id
    .replace(/(^|-)(\w)/g, (_, _sep: string, ch: string) => ` ${ch.toUpperCase()}`)
    .trim();

interface SwatchItem {
  id: string;
  hex: string;
}

/**
 * Word-colour menu: a single tinted dot trigger that opens the preset
 * palette in a floating grid — the same grouping the main contextual
 * menu's colour group uses.
 *
 * The palette renders through FloatingPopover (not TldrawUiPopover):
 * tldraw's popover calls editor.complete() when it opens, which exits the
 * rich text editor and unmounts this toolbar before the mark is applied.
 *
 * Shown while any selection is active (a word or select-all); with a
 * collapsed caret the contextual style panel's colour group is the one that
 * shows instead.
 */
function WordColorMenu({ textEditor, items }: { textEditor: TiptapEditor; items: SwatchItem[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const idForHex = (hex: string) => items.find((i) => i.hex === hex)?.id;
  // no word marks → falls back to the given "mixed", so the trigger stays untinted
  const wordColor = wordColorValue(textEditor, { type: 'mixed' }, idForHex);
  const value = wordColor.type === 'shared' ? wordColor.value : undefined;
  const currentHex = value ? items.find((i) => i.id === value)?.hex : undefined;

  const pick = useCallback(
    (hex: string) => {
      textEditor.chain().focus().setMark('color', { color: hex }).run();
      setIsOpen(false);
    },
    [textEditor],
  );

  return (
    <>
      <TldrawUiToolbarButton
        ref={triggerRef}
        type="icon"
        title="Text color"
        data-testid="rich-text.color-trigger"
        style={currentHex ? { color: currentHex } : undefined}
        isActive={isOpen}
        onPointerDown={preventDefault}
        onClick={() => setIsOpen((open) => !open)}
      >
        <TldrawUiButtonIcon icon="color" />
      </TldrawUiToolbarButton>
      <FloatingPopover anchorRef={triggerRef} open={isOpen} onClose={() => setIsOpen(false)}>
        <div
          className="tlui-menu grid gap-1 p-1"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${Math.min(4, items.length)}, minmax(0, 1fr))`,
          }}
        >
          {items.map(({ id, hex }) => (
            <TldrawUiToolbarButton
              key={id}
              type="icon"
              title={`Text color: ${colorTitle(id)}`}
              data-testid={`rich-text.color.${id}`}
              isActive={value === id}
              style={{ color: hex }}
              onPointerDown={preventDefault}
              onClick={() => pick(hex)}
            >
              <TldrawUiButtonIcon icon="color" />
            </TldrawUiToolbarButton>
          ))}
        </div>
      </FloatingPopover>
    </>
  );
}

function isAllowedHref(href: string) {
  try {
    const protocol = new URL(href).protocol;
    return protocol === 'http:' || protocol === 'https:' || protocol === 'mailto:' || protocol === 'tel:';
  } catch {
    return false;
  }
}

/**
 * Inline link editor mirroring tldraw's own LinkEditor (DefaultRichTextToolbar's
 * editing-link state): a text input plus visit/remove buttons. It renders inside
 * a FloatingPopover (not inline in the toolbar): an inline swap makes the
 * contextual toolbar resize, and the browser collapses `window.getSelection()`
 * the moment the input takes focus — tldraw's toolbar positioner reads that
 * selection live and hides the whole toolbar (opacity 0 / pointer-events none),
 * so the input would be visible but unusable. tldraw's built-in editor isn't
 * reachable when custom children are passed, hence this copy.
 */
function LinkEditor({
  textEditor,
  initialValue,
  onClose,
}: {
  textEditor: TiptapEditor;
  initialValue: string;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initialValue);

  const linkified = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
    if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  };

  const complete = useCallback(() => {
    if (!value.trim()) {
      onClose();
      return;
    }
    const href = linkified(value);
    if (!isAllowedHref(href)) {
      onClose();
      return;
    }
    textEditor.chain().focus().setMark('link', { href }).run();
    onClose();
  }, [value, textEditor, onClose]);

  const remove = useCallback(() => {
    textEditor.chain().focus().unsetMark('link').run();
    onClose();
  }, [textEditor, onClose]);

  const visit = useCallback(() => {
    if (!value.trim()) return;
    window.open(linkified(value), '_blank', 'noopener,noreferrer');
    onClose();
  }, [value, onClose]);

  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <TldrawUiInput
        className="tlui-rich-text__toolbar-link-input"
        data-testid="rich-text.link-input"
        value={value}
        onValueChange={setValue}
        onComplete={complete}
        onCancel={onClose}
        placeholder="example.com"
        autoFocus
        autoSelect
      />
      <TldrawUiButton
        type="icon"
        title="Visit link"
        data-testid="rich-text.link-visit"
        onPointerDown={preventDefault}
        onClick={visit}
        disabled={!value.trim()}
      >
        <TldrawUiButtonIcon small icon="external-link" />
      </TldrawUiButton>
      <TldrawUiButton
        type="icon"
        title={initialValue ? 'Remove link' : 'Cancel'}
        data-testid="rich-text.link-remove"
        onPointerDown={preventDefault}
        onClick={initialValue ? remove : onClose}
      >
        <TldrawUiButtonIcon small icon={initialValue ? 'trash' : 'cross-2'} />
      </TldrawUiButton>
    </div>
  );
}

/**
 * Rich text toolbar (components.RichTextToolbar).
 *
 * The "content edit" bar: shows whenever the rich text editor is open.
 * While a selection is active (a word or select-all) it carries the word
 * colour menu as well, and the contextual style panel (the element/main
 * option bar) steps aside so only this bar shows. With a collapsed caret
 * the colour menu hides and the main panel shows above the shape.
 *
 * The stock bold/italic/code/list buttons and selection positioning come
 * from DefaultRichTextToolbar(Content). Link editing is the floating editor
 * above: it is kept out of the toolbar row so the row never resizes while
 * the input holds focus (resizing lets tldraw re-read the — by then
 * collapsed — window selection and hide the toolbar). tldraw only provides
 * its own inline editor when no custom children are passed.
 *
 * No separators between the groups: hand-rolled divider elements paint
 * stray vertical strokes outside the button grid (the "corner lines").
 */
export const CanvasRichTextToolbar = track(function CanvasRichTextToolbar() {
  const editor = useEditor();
  const textEditor = useValue('textEditor', () => editor.getRichTextEditor(), [editor]);
  const presetColors = useUiPresetStore((st) => st.config?.colors);
  // tick keeps mark state (colour/link) current through ProseMirror transactions
  useRichTextTick(textEditor);

  const [editingLink, setEditingLink] = useState(false);
  const linkTriggerRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!textEditor || textEditor.isDestroyed) setEditingLink(false);
  }, [textEditor]);
  // a new selection leaves link-editing mode, like tldraw's own toolbar
  useEffect(() => {
    if (!editingLink || !textEditor || textEditor.isDestroyed) return;
    const leave = () => setEditingLink(false);
    textEditor.on('selectionUpdate', leave);
    return () => {
      textEditor.off('selectionUpdate', leave);
    };
  }, [editingLink, textEditor]);
  const closeLinkEditor = useCallback(() => {
    setEditingLink(false);
    // the input unmounts with focus inside it; hand focus back to the text
    const live = editor.getRichTextEditor();
    if (live && !live.isDestroyed) live.chain().focus().run();
  }, [editor]);

  if (!textEditor) return null;

  // any active text selection (word or select-all) is "content" context:
  // this bar owns the screen and the colour menu shows
  const hasSelection = hasActiveTextSelection(textEditor);
  const swatches: SwatchItem[] = ALL_COLORS.filter((id) => !presetColors?.hidden?.includes(id)).map((id) => ({
    id,
    hex: presetColors?.overrides?.[id] ?? getColorValue(editor, id),
  }));

  return (
    <DefaultRichTextToolbar>
      {hasSelection && <WordColorMenu textEditor={textEditor} items={swatches} />}
      <TldrawUiToolbarButton
        ref={linkTriggerRef}
        type="icon"
        title="Add or remove link"
        data-testid="rich-text.link"
        isActive={editingLink || textEditor.isActive('link')}
        onPointerDown={preventDefault}
        onClick={() => (editingLink ? closeLinkEditor() : setEditingLink(true))}
      >
        <TldrawUiButtonIcon small icon="link" />
      </TldrawUiToolbarButton>
      <DefaultRichTextToolbarContent textEditor={textEditor} />
      <FloatingPopover
        anchorRef={linkTriggerRef}
        open={editingLink}
        onClose={closeLinkEditor}
        keepTextFocus={false}
      >
        <div className="tlui-menu p-1">
          <LinkEditor
            textEditor={textEditor}
            initialValue={textEditor.isActive('link') ? textEditor.getAttributes('link').href ?? '' : ''}
            onClose={closeLinkEditor}
          />
        </div>
      </FloatingPopover>
    </DefaultRichTextToolbar>
  );
});
