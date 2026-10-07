import { useState } from "react";
import type { ResearchColumn } from "./ResearchTable";

/** Presentation preferences never replace, filter or rewrite scientific records. */
export function useTableColumns<T>(
  columns: readonly ResearchColumn<T>[],
  initial?: readonly string[],
) {
  const keys = columns.map((column) => column.key);
  const defaults = keys.filter(
    (key, index) => index === 0 || !initial || initial.includes(key),
  );
  const scope = JSON.stringify([keys, defaults]);
  const [preference, setPreference] = useState({ scope, keys: defaults });
  const visible = preference.scope === scope ? preference.keys : defaults;
  const select = (chosen: readonly string[]) =>
    setPreference({
      scope,
      keys: keys.filter((key, index) => index === 0 || chosen.includes(key)),
    });
  return {
    visible,
    defaults,
    shown: columns.filter((column) => visible.includes(column.key)),
    select,
    toggle(key: string) {
      if (key === keys[0]) return;
      select(
        visible.includes(key)
          ? visible.filter((candidate) => candidate !== key)
          : [...visible, key],
      );
    },
  };
}
