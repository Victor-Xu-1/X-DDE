/** One bridge contract for mutations which the scene command handler completes. */
export const displayCommands = [
  "options",
  "chain-display",
  "selection-action",
  "residue",
  "sequence-selection",
  "atom-region",
  "site-region",
  "focus-site",
  "attachment-geometry",
  "search-box",
  "confidence",
  "confidence-selection",
];

export class DisplayReadiness {
  private requests = new Set<string>();
  private rendering = false;
  get pending() {
    return this.rendering || this.requests.size > 0;
  }
  begin(id: string) {
    this.requests.add(id);
  }
  complete(id: unknown) {
    return typeof id === "string" && this.requests.delete(id);
  }
  render(busy: boolean) {
    this.rendering = busy;
  }
  reset() {
    this.requests.clear();
    this.rendering = false;
  }
}
