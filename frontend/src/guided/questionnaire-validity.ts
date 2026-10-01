/** Hidden steps retain drafts. Validate their native constraints without reporting a focus popup on hidden controls. */
export function firstInvalidQuestion(
  steps: readonly { valid: boolean }[],
  panels: readonly (HTMLFieldSetElement | null)[],
  through: number,
): number {
  for (let i = 0; i <= through; i++) {
    const panel = panels[i];
    if (!steps[i]?.valid || !panel) return i;
    const disabled = panel.disabled;
    try {
      panel.disabled = false;
      for (const element of Array.from(panel.elements)) {
        if (
          (element instanceof HTMLInputElement ||
            element instanceof HTMLSelectElement ||
            element instanceof HTMLTextAreaElement) &&
          !element.disabled &&
          !element.checkValidity()
        )
          return i;
      }
    } finally {
      panel.disabled = disabled;
    }
  }
  return -1;
}
