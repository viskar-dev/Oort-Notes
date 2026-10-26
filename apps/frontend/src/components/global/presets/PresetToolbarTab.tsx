import { useState } from 'react';
import { Eye, EyeOff, GripVertical } from 'lucide-react';
import { TOOL_CATALOG, type PresetConfig, type ToolId } from '@/constants/presets/catalog';
import { TOOL_ICONS } from '@/constants/presets/tool-icons';

/** Toolbar tab: the drag-order list split into visible and hidden tools.
 *  Flat 40px rows — hover/focus-within surface them and their controls;
 *  the drag itself is plain HTML5 DnD (unchanged). */
export function PresetToolbarTab({
  config,
  onChange,
}: {
  config: PresetConfig;
  onChange: (toolbar: PresetConfig['toolbar']) => void;
}) {
  const [dragId, setDragId] = useState<ToolId | null>(null);

  function move(id: ToolId, dir: -1 | 1) {
    const idx = config.toolbar.findIndex((t) => t.id === id);
    const next = [...config.toolbar];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  }

  function dropOn(id: ToolId) {
    if (!dragId || dragId === id) return;
    const next = [...config.toolbar];
    const from = next.findIndex((t) => t.id === dragId);
    const to = next.findIndex((t) => t.id === id);
    next.splice(to, 0, next.splice(from, 1)[0]);
    onChange(next);
    setDragId(null);
  }

  const visible = config.toolbar.filter((t) => t.visible);
  const hidden = config.toolbar.filter((t) => !t.visible);

  const row = (item: PresetConfig['toolbar'][number], dim: boolean) => {
    const Icon = TOOL_ICONS[item.id];
    const label = TOOL_CATALOG.find((t) => t.id === item.id)?.label ?? item.id;
    const idx = config.toolbar.findIndex((t) => t.id === item.id);
    return (
      <div
        key={item.id}
        draggable
        onDragStart={() => setDragId(item.id)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={() => dropOn(item.id)}
        className={`group flex h-10 cursor-grab items-center gap-2.5 px-2 transition-colors hover:bg-white/[0.04] focus-within:bg-white/[0.04] ${
          dragId === item.id ? 'rounded-lg bg-white/[0.06] shadow-[0_4px_16px_rgba(0,0,0,0.4)]' : ''
        }`}
      >
        <GripVertical className="h-3.5 w-3.5 shrink-0 text-faint opacity-40 transition-opacity group-hover:opacity-100" />
        <Icon className={`h-4 w-4 shrink-0 text-[#c8c8cc] ${dim ? 'opacity-50' : ''}`} />
        <span className={`flex-1 truncate text-[13px] text-ink ${dim ? 'opacity-50' : ''}`}>
          {label}
        </span>
        <button
          onClick={() => move(item.id, -1)}
          disabled={idx === 0}
          title="Move up"
          className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-ink disabled:opacity-30 group-hover:opacity-100 group-focus-within:opacity-100"
        >
          ↑
        </button>
        <button
          onClick={() => move(item.id, 1)}
          disabled={idx === config.toolbar.length - 1}
          title="Move down"
          className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-ink disabled:opacity-30 group-hover:opacity-100 group-focus-within:opacity-100"
        >
          ↓
        </button>
        <button
          onClick={() =>
            onChange(config.toolbar.map((t) => (t.id === item.id ? { ...t, visible: !t.visible } : t)))
          }
          title={item.visible ? 'Hide tool' : 'Show tool'}
          className="rounded p-1.5 text-muted-foreground opacity-60 transition-opacity hover:text-ink hover:opacity-100"
        >
          {item.visible ? <Eye className="h-4 w-4" strokeWidth={1.5} /> : <EyeOff className="h-4 w-4" strokeWidth={1.5} />}
        </button>
      </div>
    );
  };

  return (
    <div>
      <h3 className="text-sm font-medium text-ink">Toolbar</h3>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Drag to reorder. Hide tools you don't use.
      </p>
      <div className="mt-6 mb-2 text-xs text-muted-foreground">Visible · {visible.length}</div>
      <div className="flex flex-col">{visible.map((t) => row(t, false))}</div>
      <div className="mt-6 mb-2 text-xs text-muted-foreground">Hidden · {hidden.length}</div>
      <div className="flex flex-col">{hidden.map((t) => row(t, true))}</div>
    </div>
  );
}
