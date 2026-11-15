/** Native recognition companion: the same chemistry/display authority as X-DDE. */
import type { Ketcher } from "./ketcher-contract";
import { configureKetcherPreview } from "./ketcher-appearance";
import {
  foldDisplayHydrogens,
  hasNonDonorHydrogens,
} from "./ketcher-hydrogens";
import { editorLifetime } from "./editor-lifetime";

export type RecognitionEditor = Pick<
  Ketcher,
  "changeEvent" | "editor" | "getMolfile" | "getSmiles"
> & {
  structService: NonNullable<Ketcher["structService"]> & {
    getInChIKey(struct: string): Promise<string>;
  };
  getKet(): Promise<string>;
  setMolecule(value: string): Promise<void | undefined>;
  eventBus: {
    addListener(event: string, listener: () => void): unknown;
    removeListener(event: string, listener: () => void): unknown;
  };
};
const EMPTY = "\n  X-DDE\n\n  0  0  0  0  0  0  0  0  0  0999 V2000\nM  END\n";

export function configureRecognitionEditor(
  native: RecognitionEditor,
  signal: AbortSignal,
  onError: (error: unknown) => void,
  actions: {
    fit(): boolean;
    resetZoom(): void;
    onState(state: { busy: boolean; available: boolean }): void;
  },
) {
  const lifetime = editorLifetime(signal, actions.onState);
  let revision = 0,
    acceptedKet: string | null = null,
    wasEmpty = true,
    needsFit = false,
    committing = false;
  let retained: string | null = null;
  const present = (ket: string) =>
    Object.values(JSON.parse(ket)).some((node) => {
      const molecule = node as { type?: string; atoms?: unknown[] };
      return molecule?.type === "molecule" && (molecule.atoms?.length ?? 0) > 0;
    });
  const key = async (structure: string) => {
    const value = await native.structService.getInChIKey(structure);
    if (!value?.trim())
      throw new Error("无法核对分子结构，请保留原始文件并重试。");
    return value;
  };
  function fit() {
    needsFit = !actions.fit();
  }
  async function commit(prepared: string, expectedKey: string | null) {
    const failures = lifetime.failures;
    retained ??= await native.getKet();
    committing = true;
    try {
      await native.setMolecule(prepared);
      signal.throwIfAborted();
      const actual = await native.getKet();
      if (
        failures !== lifetime.failures ||
        hasNonDonorHydrogens(actual) ||
        (expectedKey === null
          ? present(actual)
          : (await key(actual)) !== expectedKey)
      )
        throw new Error("编辑器未能确认载入结果，请保留原始文件并重试。");
      acceptedKet = actual;
      retained = null;
      wasEmpty = !present(actual);
      if (wasEmpty) {
        actions.resetZoom();
        needsFit = false;
      } else fit();
      lifetime.accept();
    } finally {
      committing = false;
    }
  }
  const failed = () => {
    retained ??= acceptedKet;
    lifetime.fail();
  };
  native.eventBus.addListener("FAILURE", failed);
  signal.addEventListener(
    "abort",
    () => native.eventBus.removeListener("FAILURE", failed),
    { once: true },
  );
  const display: Ketcher = {
    structService: native.structService,
    changeEvent: native.changeEvent,
    editor: native.editor,
    getKet: () => native.getKet(),
    getMolfile: () => native.getMolfile(),
    getSmiles: () => native.getSmiles(),
    setMolecule: async (value) => {
      const original = await native.getKet();
      const expected = await key(original);
      if ((await key(value)) !== expected)
        throw new Error("显示转换不能保持分子身份，已保留原始结构。");
      if (original !== (await native.getKet()))
        throw new Error("编辑内容已更新，未覆盖新结构。");
      await commit(value, expected);
    },
  };
  configureKetcherPreview(display);
  // The public native change event cannot distinguish edits from Undo/Redo.
  // Validate only: appending automatic replacements here would trap history.
  const validateDrawing = async () => {
    if (committing || signal.aborted) return;
    const eventFailures = lifetime.failures;
    const observed = await native.getKet();
    if (
      committing ||
      signal.aborted ||
      (observed === acceptedKet && lifetime.valid) ||
      eventFailures !== lifetime.failures
    )
      return;
    if (!hasNonDonorHydrogens(observed)) {
      // Do not suspend native drawing/dragging for an unchanged display policy.
      const empty = !present(observed);
      const accept = () => {
        if (wasEmpty && !empty) fit();
        acceptedKet = observed;
        retained = null;
        wasEmpty = empty;
        lifetime.accept();
      };
      if (lifetime.valid) accept();
      else
        await lifetime.run(async () => {
          if (
            committing ||
            observed !== (await native.getKet()) ||
            eventFailures !== lifetime.failures
          )
            return;
          if (!empty) await key(observed);
          accept();
        });
      return;
    }
    retained = observed;
    lifetime.fail();
    onError(new Error("请核对绘图以隐藏非活泼氢，原始结构与撤销记录已保留。"));
  };
  let checking = false,
    pending = false;
  const changed = () => {
    if (committing || signal.aborted) return;
    if (checking) {
      pending = true;
      return;
    }
    checking = true;
    void validateDrawing()
      .catch((error) => {
        if (!signal.aborted) {
          lifetime.fail();
          onError(error);
        }
      })
      .finally(() => {
        checking = false;
        if (pending && !signal.aborted) {
          pending = false;
          changed();
        }
      });
  };
  if (!native.changeEvent)
    throw new Error("Update the drawing component to validate native edits.");
  native.changeEvent.add(changed);
  signal.addEventListener("abort", () => native.changeEvent!.remove(changed), {
    once: true,
  });
  changed();
  const load = (source: string, preserveLayout = false) => {
    const intent = ++revision;
    return lifetime.run(async () => {
      if (source.length > 5 * 1024 ** 2) throw new Error("分子文件超过 5 MB。");
      if (intent !== revision) return false;
      const before = await native.getKet();
      retained ??= before;
      const expected = source.trim() ? await key(source) : null;
      const prepared = source.trim()
        ? await foldDisplayHydrogens(display, source, preserveLayout)
        : EMPTY;
      signal.throwIfAborted();
      if (intent !== revision || before !== (await native.getKet()))
        return false;
      if (expected !== null && (await key(prepared)) !== expected)
        throw new Error("显示转换不能保持分子身份，已保留原始结构。");
      await commit(prepared, expected);
      return !signal.aborted && intent === revision;
    });
  };
  return {
    failed,
    fitWhenVisible() {
      if (needsFit && !signal.aborted) fit();
    },
    load,
    retainedDrawing() {
      const value = retained ?? acceptedKet;
      return value && present(value) ? value : null;
    },
    async recheck() {
      return load(retained ?? (await native.getKet()), true);
    },
  };
}
