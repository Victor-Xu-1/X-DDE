/** A synchronous approval epoch for host-owned molecular export side effects. */
export class MoleculeReadinessError extends Error {}

export function moleculeReadiness() {
  let ready = false,
    revision = 0;
  return {
    get available() {
      return ready;
    },
    update(value: boolean) {
      ready = value;
      revision++;
    },
    checkpoint() {
      if (!ready)
        throw new MoleculeReadinessError(
          "Review the current drawing before exporting.",
        );
      return revision;
    },
    verify(checkpoint: number) {
      if (!ready || checkpoint !== revision)
        throw new MoleculeReadinessError(
          "The drawing changed during export. Review it and retry.",
        );
    },
  };
}

/** Clear a recovered drawing error without discarding a newer upload/model error. */
export function drawingErrorOwner(
  write: (update: (current: string) => string) => void,
) {
  let owned: string | null = null;
  return (message: string) => {
    const previous = owned;
    owned = message || null;
    write((current) => message || (current === previous ? "" : current));
  };
}
