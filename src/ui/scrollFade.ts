/**
 * Rows of buttons that scroll sideways (tools, shapes, 3D views, settings) fade at the edge that has more
 * to see. This sets data-fade-start and data-fade-end on each row, and the CSS draws the fade.
 */
const ROWS = '.picker, .rail, .ctx-options';
const EDGE = 4; // px of slack, so a row that is almost at the end counts as at the end

function update(row: HTMLElement): void {
  const room = row.scrollWidth - row.clientWidth;
  row.dataset.fadeStart = String(room > EDGE && row.scrollLeft > EDGE);
  row.dataset.fadeEnd = String(room > EDGE && row.scrollLeft < room - EDGE);
}

/** Starts watching. Returns a function that stops. */
export function watchScrollFade(): () => void {
  const sized = new ResizeObserver((entries) => entries.forEach((e) => update(e.target as HTMLElement)));
  const watched = new Set<Element>();
  let frame = 0;

  const refresh = () => {
    frame = 0;
    document.querySelectorAll<HTMLElement>(ROWS).forEach((row) => {
      if (!watched.has(row)) {
        watched.add(row);
        sized.observe(row);
      }
      update(row); // the buttons inside may have changed, which the size watcher does not see
    });
  };
  const soon = () => {
    if (!frame) frame = requestAnimationFrame(refresh);
  };
  const onScroll = (e: Event) => {
    if (e.target instanceof HTMLElement && e.target.matches(ROWS)) update(e.target);
  };

  const changes = new MutationObserver(soon);
  changes.observe(document.body, { childList: true, subtree: true });
  document.addEventListener('scroll', onScroll, { capture: true, passive: true }); // scroll does not bubble
  window.addEventListener('resize', soon);
  soon();

  return () => {
    changes.disconnect();
    sized.disconnect();
    document.removeEventListener('scroll', onScroll, { capture: true });
    window.removeEventListener('resize', soon);
    if (frame) cancelAnimationFrame(frame);
  };
}
