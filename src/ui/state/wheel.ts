/**
 * A wheel over a focused number field changes its value in some browsers, silently and with
 * autosave (#337). One listener for the whole app stops that and scrolls on instead, so scrolling
 * over a field still moves the page. Returns the function that removes the listener.
 */
export function guardNumberWheel(target: Document): () => void {
  const onWheel = (event: WheelEvent) => {
    const field = event.target;
    if (!(field instanceof HTMLInputElement) || field.type !== 'number') return;
    // Only a focused field reacts to the wheel; any other one already lets the page scroll.
    if (field !== target.activeElement || event.ctrlKey) return;
    event.preventDefault();
    const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1;
    scroller(field).scrollBy({ left: event.deltaX * scale, top: event.deltaY * scale });
  };
  target.addEventListener('wheel', onWheel, { passive: false, capture: true });
  return () => target.removeEventListener('wheel', onWheel, { capture: true });
}

/** The nearest ancestor that scrolls, else the page. */
function scroller(el: Element): Element {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const { overflowX, overflowY } = getComputedStyle(node);
    const scrolls = (o: string) => o === 'auto' || o === 'scroll';
    if (
      (scrolls(overflowY) && node.scrollHeight > node.clientHeight) ||
      (scrolls(overflowX) && node.scrollWidth > node.clientWidth)
    )
      return node;
  }
  return document.scrollingElement ?? document.documentElement;
}
