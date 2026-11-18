import { createContext } from "react";
import type { RuntimeCatalogue } from "./backend-runtime";

export type BackendControlScope =
  | { capability: string }
  | { capabilities: readonly string[] }
  | { operations: readonly string[] };

export const PrimaryBackendScope = createContext<BackendControlScope | null>(
  null,
);

export function enginesForScope(
  catalogue: RuntimeCatalogue | null,
  scope: BackendControlScope | null,
) {
  if (!catalogue || !scope) return [];
  if ("operations" in scope)
    return catalogue.engines.filter((row) =>
      row.operations?.some((operation) => scope.operations.includes(operation)),
    );
  const capabilities =
    "capability" in scope ? [scope.capability] : scope.capabilities;
  const owners = new Set(
    capabilities.map((id) => catalogue.capabilities?.[id]),
  );
  return catalogue.engines.filter((row) => owners.has(row.id));
}
