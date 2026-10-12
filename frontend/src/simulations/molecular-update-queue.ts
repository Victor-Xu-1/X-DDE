/** Serialize native mutations while returning each operation's actual failure. */
export class MolecularUpdateQueue {
  private settled: Promise<void> = Promise.resolve();

  run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.settled.then(operation);
    this.settled = result.then(
      () => {},
      () => {},
    );
    return result;
  }
}
