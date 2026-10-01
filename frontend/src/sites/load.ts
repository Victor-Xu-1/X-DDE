import { request } from "../api";
export async function loadPages<T>(
  path: string,
  signal: AbortSignal,
): Promise<T[]> {
  const values: T[] = [];
  for (let offset = 0; offset < 10000; offset += 200) {
    const page = await request<T[]>(
      path + (path.includes("?") ? "&" : "?") + "limit=200&offset=" + offset,
      { signal },
    );
    values.push(...page);
    if (page.length < 200) return values;
  }
  throw new Error(
    "Too many matching records to display. Narrow the source collection.",
  );
}
