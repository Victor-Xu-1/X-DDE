/** Standalone worker replies are matched by input, but its listeners are once-only.
 * Keep conversions on one service ordered so a different reply cannot consume a
 * pending listener. Native chemistry and the original arguments remain unchanged.
 */
export function serializeKetcherConversions<Args extends unknown[], Result>(
  convert: (...args: Args) => Promise<Result>,
): (...args: Args) => Promise<Result> {
  let previous: Promise<void> = Promise.resolve();
  return (...args: Args) => {
    const result = previous.then(() => convert(...args));
    previous = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
}
