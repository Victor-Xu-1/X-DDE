import { request } from "../api";

export function availabilityError(message: string, zh: boolean) {
  return message.replace(/^Error:\s*/, "") ===
    "The calculation environment could not be checked."
    ? zh
      ? "暂时无法确认计算环境。"
      : "The calculation environment could not be checked."
    : message;
}

/** Keep task forms and backend choices on the same validated availability contract. */
export async function taskAvailability(id: string, signal: AbortSignal) {
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(15000)]);
  const value = await request<{
    availability?: { configuration_present?: unknown };
  }>("/capabilities/" + encodeURIComponent(id), { signal: bounded });
  bounded.throwIfAborted();
  const ready = value.availability?.configuration_present;
  if (typeof ready !== "boolean")
    throw new Error("The calculation environment could not be checked.");
  return ready;
}
