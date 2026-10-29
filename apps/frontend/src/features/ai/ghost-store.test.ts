import { beforeEach, describe, expect, it } from 'vitest';
import { useAiGhostStore } from './ghost-store';

/** The glow bookkeeping is state machine logic the shimmer rides on: a
 *  wrong remove must never kill another executor's ghost (it used to match
 *  by id prefix; now batches are exact), and clear must reset to nothing. */
describe('ghost store batches', () => {
  beforeEach(() => {
    useAiGhostStore.getState().clear();
  });

  it('remove withdraws exactly the announced batch, not its prefixes', () => {
    const first = useAiGhostStore.getState().push([{ x: 0, y: 0, w: 10, h: 10 }]);
    const second = useAiGhostStore.getState().push([{ x: 20, y: 20, w: 5, h: 5 }]);
    expect(second).not.toBe(first);

    useAiGhostStore.getState().remove(first);
    const ghosts = useAiGhostStore.getState().ghosts;
    expect(ghosts).toHaveLength(1);
    expect(ghosts[0].batch).toBe(second);
    expect(ghosts[0]).toMatchObject({ x: 20, y: 20, w: 5, h: 5 });

    useAiGhostStore.getState().remove(second);
    expect(useAiGhostStore.getState().ghosts).toHaveLength(0);
  });

  it('impossible boxes are dropped, finite ones survive, clear wipes all', () => {
    const batch = useAiGhostStore.getState().push([
      { x: 1, y: 2, w: 30, h: 40 },
      { x: 3, y: 4, w: 0, h: 10 }, // zero width
      { x: 3, y: 4, w: 10, h: Number.NaN }, // NaN height
      { x: Number.POSITIVE_INFINITY, y: 0, w: 10, h: 10 },
    ]);
    const ghosts = useAiGhostStore.getState().ghosts;
    expect(ghosts).toHaveLength(1);
    expect(ghosts.every((ghost) => ghost.batch === batch)).toBe(true);

    useAiGhostStore.getState().clear();
    expect(useAiGhostStore.getState().ghosts).toHaveLength(0);
  });
});
