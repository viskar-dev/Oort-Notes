import type { ReactNode } from 'react';
import { Controller } from 'react-hook-form';
import { FileText, Infinity as InfinityIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CANVAS_TYPE_CHOICES } from '@/constants/chapters/canvas-types';
import { useChapterCreateForm } from './useChapterCreateForm';

const labelClass = 'text-[13px] font-medium text-faint';
const errorClass = 'mt-1.5 text-[11px] text-destructive';

const CANVAS_OPTIONS = [
  { finite: false, label: 'Infinite', Icon: InfinityIcon },
  { finite: true, label: 'Finite', Icon: FileText },
] as const;

function SelectRow({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className={labelClass}>{label}</span>
        <div className="w-44 shrink-0">{children}</div>
      </div>
      {error && (
        <p role="alert" className={`${errorClass} text-right`}>
          {error}
        </p>
      )}
    </div>
  );
}

export function ChapterCreateForm({
  notebookId,
  onCreated,
  onCancel,
}: {
  notebookId: string;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const {
    form,
    canvasType,
    name,
    presets,
    uiPresets,
    optionsError,
    serverError,
    isSubmitting,
    submit,
  } = useChapterCreateForm({ notebookId, onCreated });

  const otherCanvasType = CANVAS_TYPE_CHOICES.find((c) => c.value !== 'page')?.value;
  const isPage = canvasType === 'page';

  const setFinite = (finite: boolean) => {
    const next = finite ? 'page' : otherCanvasType;
    if (next) form.setValue('canvasType', next, { shouldValidate: true });
  };

  const nameError = form.formState.errors.name?.message;
  const presetError = form.formState.errors.presetId?.message;
  const formError = optionsError ?? serverError;

  return (
    <form onSubmit={submit} className="flex w-full flex-col gap-4 " noValidate>
      <div className=''>
        <label htmlFor="chapter-create-name" className={`${labelClass} mb-1.5 block`}>
          Name
        </label>
        <Input
          id="chapter-create-name"
          aria-invalid={Boolean(nameError)}
          aria-describedby={nameError ? 'chapter-create-name-error' : undefined}
          {...form.register('name')}
          autoFocus
          placeholder="e.g. Graph Theory"
        />
        {nameError && (
          <p id="chapter-create-name-error" role="alert" className={errorClass}>
            {nameError}
          </p>
        )}
      </div>

      <div>
        <span className={`${labelClass} mb-1.5 block`}>Canvas</span>
        <div
          role="radiogroup"
          aria-label="Canvas type"
          className="grid grid-cols-2 gap-1 rounded-lg border border-line p-1"
        >
          {CANVAS_OPTIONS.map(({ finite, label, Icon }) => {
            const active = isPage === finite;
            return (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setFinite(finite)}
                className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-[13px] font-medium transition-colors ${
                  active ? 'bg-raised text-ink' : 'text-faint hover:text-ink'
                }`}
              >
                <Icon className="size-4" />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {isPage && (
        <SelectRow label="Page size" error={presetError}>
          <Controller
            control={form.control}
            name="presetId"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(v) => field.onChange(v as unknown as string)}
                items={
                  presets
                    ? Object.fromEntries(presets.map((p) => [p.id, `${p.name} `]))
                    : undefined
                }
              >
                <SelectTrigger
                  className="w-full"
                  aria-label="Page size"
                  aria-invalid={Boolean(presetError)}
                >
                  <SelectValue placeholder="Select size" />
                </SelectTrigger>
                <SelectContent>
                  {(['paper', 'ratio'] as const).map((category) => (
                    <SelectGroup key={category}>
                      <SelectLabel>{category === 'paper' ? 'Paper' : 'Aspect ratio'}</SelectLabel>
                      {presets
                        ?.filter((p) => p.category === category)
                        .map((p) => (
                          <SelectItem
                            key={p.id}
                            value={p.id}
                            label={`${p.name} (${p.size_label})`}
                          >
                            {p.name}
                          </SelectItem>
                        ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </SelectRow>
      )}

      <SelectRow label="UI preset">
        <Controller
          control={form.control}
          name="uiPresetId"
          render={({ field }) => (
            <Select
              value={field.value}
              onValueChange={(v) => field.onChange(v as unknown as string)}
              items={{
                '': 'tldraw defaults',
                ...Object.fromEntries(uiPresets.map((p) => [p.id, p.name])),
              }}
            >
              <SelectTrigger className="w-full" aria-label="UI preset">
                <SelectValue placeholder="tldraw defaults" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">tldraw defaults</SelectItem>
                {uiPresets.map((p) => (
                  <SelectItem key={p.id} value={p.id} label={p.name}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </SelectRow>

      {formError && (
        <div
          role="alert"
          className="rounded-lg border border-line bg-surface px-4 py-3 text-sm text-destructive"
        >
          {formError}
        </div>
      )}

      <div className="mt-2 w-full flex justify-end items-center">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!name.trim() || isSubmitting}>
          {isSubmitting ? 'Creating…' : 'Create'}
        </Button>
      </div>
    </form>
  );
}
