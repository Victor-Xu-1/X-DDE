/** Visible labels distinguish choices without exposing internal database identifiers. */
export function historyChoiceLabel(
  name: string,
  index: number,
  zh: boolean,
  createdAt?: string,
) {
  const date = createdAt ? new Date(createdAt) : null;
  const when =
    date && Number.isFinite(date.getTime())
      ? date.toLocaleString(zh ? "zh-CN" : "en-GB", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";
  return [name, when, `#${index + 1}`].filter(Boolean).join(" · ");
}

export function nameCounts(names: Iterable<string>) {
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  return counts;
}
