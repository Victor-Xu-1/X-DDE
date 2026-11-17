import { expect, it, vi } from "vitest";
import { serializeKetcherConversions } from "./ketcher-conversions";

/** Model the installed standalone worker's once listener and input correlation. */
function worker() {
  let listeners: {
    input: string;
    resolve(value: string): void;
    reject(error: Error): void;
  }[] = [];
  const requests: { input: string; format: string }[] = [];
  const convert = vi.fn(
    (input: string, format: string) =>
      new Promise<string>((resolve, reject) => {
        requests.push({ input, format });
        listeners.push({ input, resolve, reject });
      }),
  );
  return {
    convert,
    requests,
    reply(input: string, output: string, error?: Error) {
      const once = listeners;
      listeners = [];
      for (const listener of once)
        if (listener.input === input) {
          if (error) listener.reject(error);
          else listener.resolve(output);
        }
    },
  };
}
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

it("reproduces loss of an unmatched once listener in concurrent standalone conversions", async () => {
  const native = worker(),
    settled: string[] = [];
  void native
    .convert("first graph", "smiles")
    .then((value) => settled.push(value));
  void native
    .convert("second graph", "mol")
    .then((value) => settled.push(value));
  native.reply("first graph", "first result");
  native.reply("second graph", "second result");
  await flush();
  expect(settled).toEqual(["first result"]);
});

it("preserves distinct graph/format results while admitting only one worker conversion", async () => {
  const native = worker(),
    convert = serializeKetcherConversions(native.convert);
  const first = convert("first graph", "smiles"),
    second = convert("second graph", "mol");
  await flush();
  expect(native.requests).toEqual([{ input: "first graph", format: "smiles" }]);
  native.reply("first graph", "first result");
  await flush();
  expect(native.requests).toEqual([
    { input: "first graph", format: "smiles" },
    { input: "second graph", format: "mol" },
  ]);
  native.reply("second graph", "second result");
  await expect(Promise.all([first, second])).resolves.toEqual([
    "first result",
    "second result",
  ]);
});

it("a failed native conversion rejects its caller and releases the following conversion", async () => {
  const native = worker(),
    convert = serializeKetcherConversions(native.convert);
  const first = convert("bad graph", "mol"),
    second = convert("valid graph", "smiles");
  const failure = expect(first).rejects.toThrow("Native conversion failed");
  await flush();
  native.reply("bad graph", "", new Error("Native conversion failed"));
  await failure;
  await flush();
  expect(native.requests[1]).toEqual({
    input: "valid graph",
    format: "smiles",
  });
  native.reply("valid graph", "valid result");
  await expect(second).resolves.toBe("valid result");
});

it("the same graph in two formats retains both native results", async () => {
  const native = worker(),
    convert = serializeKetcherConversions(native.convert);
  const smiles = convert("same graph", "smiles"),
    mol = convert("same graph", "mol");
  await flush();
  native.reply("same graph", "SMILES result");
  await flush();
  native.reply("same graph", "MOL result");
  await expect(Promise.all([smiles, mol])).resolves.toEqual([
    "SMILES result",
    "MOL result",
  ]);
});

it("a synchronous native failure also releases the following call", async () => {
  const native = vi.fn((input: string) => {
    if (input === "bad") throw new Error("Native failure");
    return Promise.resolve(input);
  });
  const convert = serializeKetcherConversions(native);
  const first = convert("bad"),
    second = convert("valid");
  await expect(first).rejects.toThrow("Native failure");
  await expect(second).resolves.toBe("valid");
});
