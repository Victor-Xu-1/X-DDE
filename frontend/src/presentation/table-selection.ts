/** Cell selection must not consume an independent action inside the row. */
export function isRowSelectionTarget(
  target: EventTarget | null,
  row: HTMLElement,
) {
  return (
    target instanceof Element &&
    row.contains(target) &&
    !target.closest(
      'a, button, input, select, textarea, summary, [role="button"], [role="checkbox"], [role="switch"], [role="link"], [contenteditable]:not([contenteditable="false"]), [data-row-action]',
    )
  );
}
