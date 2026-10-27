import { useState } from 'react';
import { Eye, EyeOff, GripVertical } from 'lucide-react';
import { TOOL_CATALOG, type PresetConfig, type ToolId } from '@/constants/presets/catalog';
import { TOOL_ICONS } from '@/constants/presets/tool-icons';

/** Toolbar tab: the drag-order list split into visible and hidden tools. */
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
        className={`flex cursor-grab items-center gap-3  rounded-xl border px-3.5 py-2.5 transition-colors ${
          dim
            ? 'border-line/60 bg-surface/50 text-muted-foreground'
            : 'border-line bg-surface text-ink'
        } ${dragId === item.id ? 'opacity-40' : ''}`}
      >
        <GripVertical className="h-4 w-4 shrink-0 text-faint" />
        <Icon className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-sm">{label}</span>
        <button
          onClick={() => move(item.id, -1)}
          disabled={idx === 0}
          title="Move up"
          className="rounded-md p-1 text-xs text-muted-foreground hover:bg-raised disabled:opacity-30"
        >
          ↑
        </button>
        <button
          onClick={() => move(item.id, 1)}
          disabled={idx === config.toolbar.length - 1}
          title="Move down"
          className="rounded-md p-1 text-xs text-muted-foreground hover:bg-raised disabled:opacity-30"
        >
          ↓
        </button>
        <button
          onClick={() =>
            onChange(config.toolbar.map((t) => (t.id === item.id ? { ...t, visible: !t.visible } : t)))
          }
          title={item.visible ? 'Hide tool' : 'Show tool'}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-raised hover:text-ink"
        >
          {item.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </button>
      </div>
    );
  };

  return (
    <div>
      <h3 className="mb-1 text-base font-semibold">Toolbar</h3>
      <p className="mb-4 text-sm text-muted-foreground">
        Drag to reorder. Hide tools you don't use.
      </p>
      <div className="mb-2 flex items-center justify-between text-[11px] font-semibold tracking-widest text-muted-foreground">
        <span>VISIBLE</span>
        <span>{visible.length} tools</span>
      </div>
      <div className="mb-6 flex flex-col gap-1.5">{visible.map((t) => row(t, false))}</div>
      <div className="mb-2 flex items-center justify-between text-[11px] font-semibold tracking-widest text-muted-foreground">
        <span>HIDDEN</span>
        <span>{hidden.length} hidden</span>
      </div>
      <div className="flex flex-col gap-1.5">{hidden.map((t) => row(t, true))}</div>
    </div>
  );
}
