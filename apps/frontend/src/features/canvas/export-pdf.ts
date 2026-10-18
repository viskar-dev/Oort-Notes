import { Box, type Editor as TldrawEditor, type TLShapeId } from 'tldraw';

/**
 * PDF export for 'page' chapters: each sheet region of the open topic's
 * stack becomes one PDF page. Rendering goes through tldraw's own
 * `editor.toImage` (SVG export + rasterization with embedded fonts), which
 * sidesteps the tainted-canvas problem a manual <img>→canvas step runs into
 * when the exported SVG references external font assets.
 */

interface ExportOpts {
  pageWidth: number;
  pageHeight: number;
  sheetCount: number;
  /** Gap between sheet regions in the stack (must match the canvas layout). */
  gap: number;
  fileName: string;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('could not read the rendered page'));
    reader.readAsDataURL(blob);
  });
}

export async function exportChapterToPdf(
  editor: TldrawEditor,
  { pageWidth, pageHeight, sheetCount, gap, fileName }: ExportOpts,
): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const orientation = pageWidth > pageHeight ? 'landscape' : 'portrait';
  const pdf = new jsPDF({ unit: 'px', format: [pageWidth, pageHeight], orientation });

  const shapes = editor.getCurrentPageShapes();
  // shape bounds in page coordinates (the stack's y includes the gaps)
  const boundsById = shapes
    .map((s) => ({ id: s.id, bounds: editor.getShapePageBounds(s.id) }))
    .filter((b): b is { id: TLShapeId; bounds: Box } => b.bounds !== undefined);

  for (let i = 0; i < sheetCount; i++) {
    const top = i * (pageHeight + gap);
    const sheet = new Box(0, top, pageWidth, pageHeight);
    const ids = boundsById
      .filter(({ bounds }) => bounds.x + bounds.w > top && bounds.x < top + pageHeight)
      .map(({ id }) => id);

    if (i > 0) pdf.addPage([pageWidth, pageHeight], orientation);

    if (ids.length === 0) continue; // blank sheet → blank white PDF page

    const { blob } = await editor.toImage(ids, {
      bounds: sheet,
      background: true,
      scale: 2,
      format: 'png',
    });
    pdf.addImage(await blobToDataUrl(blob), 'PNG', 0, 0, pageWidth, pageHeight);
  }

  pdf.save(fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`);
}
