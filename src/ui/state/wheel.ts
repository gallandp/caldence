/**
 * A wheel over a focused number field changes its value in some browsers, silently and with
 * autosave (#337). One handler for the whole app stops that and scrolls on instead, so scrolling
 * over a field still moves the page. The blocking wheel listener sits only on the focused number
 * field, so the rest of the page keeps passive, smooth scrolling. Returns the function that
 * removes the handler.
 */
export function guardNumberWheel(target: Document): () => void {
  const onWheel = (event: WheelEvent) => {
    if (event.ctrlKey) return; // zooming
    event.preventDefault();
    const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1;
    const dx = event.deltaX * scale;
    const dy = event.deltaY * scale;
    scroller(event.currentTarget as Element, dx, dy).scrollBy({ left: dx, top: dy });
  };
  const onFocusIn = (event: FocusEvent) => {
    const field = event.target;
    if (!(field instanceof HTMLInputElement) || field.type !== 'number') return;
    field.addEventListener('wheel', onWheel, { passive: false });
    field.addEventListener('focusout', () => field.removeEventListener('wheel', onWheel), {
      once: true,
    });
  };
  target.addEventListener('focusin', onFocusIn);
  return () => target.removeEventListener('focusin', onFocusIn);
}

/** The nearest ancestor that can still scroll in the wheel's direction, else the page. */
function scroller(el: Element, dx: number, dy: number): Element {
  const vertical = Math.abs(dy) >= Math.abs(dx);
  const delta = vertical ? dy : dx;
  for (let node = el.parentElement; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    const overflow = vertical ? style.overflowY : style.overflowX;
    if (overflow !== 'auto' && overflow !== 'scroll') continue;
    const pos = vertical ? node.scrollTop : node.scrollLeft;
    const max = vertical
      ? node.scrollHeight - node.clientHeight
      : node.scrollWidth - node.clientWidth;
    if ((delta > 0 && pos < max - 1) || (delta < 0 && pos > 0)) return node;
  }
  return document.scrollingElement ?? document.documentElement;
}
