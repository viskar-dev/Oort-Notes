import { StateNode } from 'tldraw';

/**
 * The "Components" tool. Registered on the editor via the `tools` prop and
 * shown in the toolbar by the Toolbar component override. Selecting it opens
 * the components picker; Escape returns to the select tool (which closes the
 * picker).
 */
export class ComponentsTool extends StateNode {
  static override id = 'components';

  override onEnter() {
    this.editor.setCursor({ type: 'default', rotation: 0 });
  }

  override onKeyDown(info: { key: string }) {
    if (info.key === 'Escape') {
      this.editor.setCurrentTool('select');
    }
  }
}
