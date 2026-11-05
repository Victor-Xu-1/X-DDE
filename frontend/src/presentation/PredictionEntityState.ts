import { useId, useRef, type Dispatch, type SetStateAction } from "react";
import type { Component } from "../types";

/** View identities only. The parent's functional state remains the input authority. */
export function usePredictionEntityState(
  onChange: Dispatch<SetStateAction<Component[]>>,
  sharedKeys?: WeakMap<Component, string>,
) {
  const scope = useId();
  const localKeys = useRef(new WeakMap<Component, string>());
  const keys = sharedKeys ?? localKeys.current;
  const serial = useRef(0);
  function key(item: Component) {
    let value = keys.get(item);
    if (!value) {
      value = scope + "-entity-" + serial.current++;
      keys.set(item, value);
    }
    return value;
  }
  function update(id: string, patch: Partial<Component>) {
    onChange((previous) => {
      const index = previous.findIndex((item) => key(item) === id);
      if (index < 0) return previous;
      const changed = { ...previous[index], ...patch };
      keys.set(changed, id);
      return previous.map((item, n) => (n === index ? changed : item));
    });
  }
  function remove(id: string) {
    onChange((previous) =>
      previous.length > 1
        ? previous.filter((item) => key(item) !== id)
        : previous,
    );
  }
  function updateAll(patch: Partial<Component>) {
    onChange((previous) =>
      previous.map((item) => {
        const changed = { ...item, ...patch };
        keys.set(changed, key(item));
        return changed;
      }),
    );
  }
  function add(kind: Component["kind"]) {
    const item: Component = {
      kind,
      value: kind === "ion" ? "MG" : "",
      count: 1,
    };
    key(item);
    onChange((previous) =>
      previous.length < 8 ? [...previous, item] : previous,
    );
  }
  return { key, update, updateAll, remove, add };
}
