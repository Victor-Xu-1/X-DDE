import { createContext, useContext } from "react";
import type { PreparedExample } from "./types";
import type { TaskRequest } from "../operations/types";

export const ExampleContext = createContext<PreparedExample | null>(null);
export function useExample() {
  return useContext(ExampleContext);
}

export function useExampleReference(...keys: string[]) {
  const example = useExample();
  return (
    keys.map((key) => example?.objects[key]?.reference).find(Boolean) ?? null
  );
}

export function useExampleTask<O extends TaskRequest["operation"]>(
  operation: O,
) {
  const value = useExample()?.request;
  return value?.operation === operation
    ? (value as Extract<TaskRequest, { operation: O }>)
    : null;
}
