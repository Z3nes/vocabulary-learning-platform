/**
 * Scrolls `container` (never the page behind it) so `target` sits near its top,
 * unless the target is already comfortably visible: above the bottom quarter of
 * the container. Focus is not touched. Instant under reduced motion.
 */
export function revealInContainer(container: HTMLElement, target: HTMLElement, margin = 16) {
  const box = container.getBoundingClientRect();
  const rect = target.getBoundingClientRect();
  const comfortablyVisible = rect.top >= box.top && rect.bottom <= box.top + box.height * 0.75;
  if (comfortablyVisible) return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  container.scrollTo({
    top: container.scrollTop + rect.top - box.top - margin,
    behavior: reduceMotion ? 'instant' : 'smooth',
  });
}
