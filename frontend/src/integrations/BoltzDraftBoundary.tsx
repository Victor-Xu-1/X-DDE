import { useState, type ReactNode } from "react";
import type { BoltzDraft } from "./boltz-draft";

/** Only explicit resume replaces this form; leaving Boltz discards this UI lifetime. */
export function BoltzDraftBoundary({
  children,
}: {
  children(value: {
    initialDraft: BoltzDraft | null;
    edition: number;
    onResume(value: BoltzDraft): void;
  }): ReactNode;
}) {
  const [initialDraft, setInitialDraft] = useState<BoltzDraft | null>(null);
  const [edition, setEdition] = useState(0);
  return children({
    initialDraft,
    edition,
    onResume: (value) => {
      setInitialDraft(value);
      setEdition((current) => current + 1);
    },
  });
}
