import { Controller } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CANVAS_TYPE_CHOICES } from '@/constants/chapters/canvas-types';
import { useChapterCreateForm } from './useChapterCreateForm';

/** Chapter-create form body: name, canvas type toggle and the page/UI preset
 *  selects; the dialog shell around it lives with the page. */
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

  const selectedPreset = presets?.find((p) => p.id === form.watch('presetId'));
  const nameError = form.formState.errors.name?.message;
  const presetError = form.formState.errors.presetId?.message;

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div>
        <label htmlFor="chapter-create-name" className="mb-1.5 block text-[13px] font-medium text-[#a09fab]">
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
          <p id="chapter-create-name-error" role="alert" className="mt-1.5 text-[11px] text-[#f87171]">
            {nameError}
          </p>
        )}
      </div>

      <div>
        <label className="mb-1.5 block text-[13px] font-medium text-[#a09fab]">Canvas type</label>
        <div className="grid grid-cols-2 gap-2">
          {CANVAS_TYPE_CHOICES.map((choice) => (
            <button
              key={choice.value}
              type="button"
              aria-pressed={canvasType === choice.value}
              onClick={() => form.setValue('canvasType', choice.value, { shouldValidate: true })}
              className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                canvasType === choice.value
                  ? 'border-[#7c6ee6] bg-[#17161c]'
                  : 'border-[#24232c] hover:border-[#3f3f46]'
              }`}
            >
              <div className="text-[13px] font-medium text-[#f4f4f6]">{choice.title}</div>
              <div className="text-[11px] text-[#8b8a96]">{choice.hint}</div>
            </button>
          ))}
        </div>
      </div>

      {canvasType === 'page' && (
        <div>
          <label className="mb-1.5 block text-[13px] font-medium text-[#a09fab]">Page size</label>
          <Controller
            control={form.control}
            name="presetId"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(v) => field.onChange(v as unknown as string)}
                items={
                  presets ? Object.fromEntries(presets.map((p) => [p.id, `${p.name} (${p.size_label})`])) : undefined
                }
              >
                <SelectTrigger aria-invalid={Boolean(presetError)}>
                  <SelectValue placeholder="Choose a page size" />
                </SelectTrigger>
                <SelectContent>
                  {(['paper', 'ratio'] as const).map((category) => (
                    <SelectGroup key={category}>
                      <SelectGroupLabel>{category === 'paper' ? 'Paper' : 'Aspect ratio'}</SelectGroupLabel>
                      {presets
                        ?.filter((p) => p.category === category)
                        .map((p) => (
                          <SelectItem key={p.id} value={p.id} label={`${p.name} (${p.size_label})`}>
                            {p.name} ({p.size_label})
                          </SelectItem>
                        ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {presetError && (
            <p role="alert" className="mt-1.5 text-[11px] text-[#f87171]">
              {presetError}
            </p>
          )}
          {selectedPreset && !presetError && (
            <p className="mt-1.5 text-[11px] text-[#8b8a96]">
              {selectedPreset.width} × {selectedPreset.height} px, {selectedPreset.orientation}
            </p>
          )}
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-[13px] font-medium text-[#a09fab]">UI preset</label>
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
              <SelectTrigger>
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
        {uiPresets.length === 0 && (
          <p className="mt-1.5 text-[11px] text-[#8b8a96]">
            No presets yet — create one in Settings → Presets.
          </p>
        )}
      </div>

      {(optionsError ?? serverError) && (
        <div role="alert" className="rounded-lg border border-[#24232c] bg-[#111016] px-4 py-3 text-sm text-[#f87171]">
          {optionsError ?? serverError}
        </div>
      )}

      <DialogFooter className="mt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!name.trim() || isSubmitting}>
          {isSubmitting ? 'Creating…' : 'Create'}
        </Button>
      </DialogFooter>
    </form>
  );
}
