/** Use the chrome window scheduler: the SDT content realm is destroyed on exit. */
export function createReadingLayout(view: { _handleViewUpdate(synchronous: boolean): void }, clock: {
  requestAnimationFrame(callback: () => void): number;
  cancelAnimationFrame(id: number): void;
}) {
  let frame: number | undefined, dirty = false, stopped = false;
  const flush = () => {
    if (frame !== undefined) clock.cancelAnimationFrame(frame);
    frame = undefined;
    if (!dirty || stopped) return;
    dirty = false;
    // A redraw alone retains cached ranges and memoized overlay geometry.
    // Native view updates invalidate both caches, repaint synchronously and reposition popups.
    view._handleViewUpdate(true);
  };
  return {
    changed() {
      if (stopped) return;
      dirty = true;
      if (frame === undefined) frame = clock.requestAnimationFrame(flush);
    },
    flush,
    dispose() {
      if (frame !== undefined) clock.cancelAnimationFrame(frame);
      frame = undefined; dirty = false; stopped = true;
    },
  };
}
