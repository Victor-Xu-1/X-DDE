import { createContext } from "react";
import type { RuntimeCatalogue } from "./backend-runtime";

export type BackendControlScope =
  | { capability: string }
  | { operations: readonly string[] };

export const PrimaryBackendScope = createContext<BackendControlScope | null>(
  null,
);

export function enginesForScope(
  catalogue: RuntimeCatalogue | null,
  scope: BackendControlScope | null,
) {
  if (!catalogue || !scope) return [];
  return catalogue.engines.filter((row) =>
    "capability" in scope
      ? row.id === catalogue.capabilities?.[scope.capability]
      : row.operations?.some((operation) => scope.operations.includes(operation)),
  );
}
