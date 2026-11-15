/** Native recognition companion: the same chemistry/display authority as X-DDE. */
import type { Ketcher } from "./ketcher-contract";
import { configureKetcherPreview } from "./ketcher-appearance";
import {
  foldDisplayHydrogens,
  hasNonDonorHydrogens,
} from "./ketcher-hydrogens";
import { editorLifetime, editorResize } from "./editor-lifetime";
export { createMolecularViewport } from "./native-molecular-viewport";

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
// Native KET atom locations carry X/Y/Z. This editor owns derived 2D drawings,
// not the original calculated pose. Spatial imports require explicit layout.
const spatial = (ket: string) =>
  Object.values(JSON.parse(ket)).some((node) => {
    const molecule = node as {
      type?: string;
      atoms?: { location?: number[] }[];
    };
    return (
      molecule?.type === "molecule" &&
      molecule.atoms?.some(
        (atom) =>
          atom.location?.length === 3 &&
          (!Number.isFinite(atom.location[2]) ||
            Math.abs(atom.location[2]) > 1e-6),
      )
    );
  });

export function configureRecognitionEditor(
  native: RecognitionEditor,
  signal: AbortSignal,
  onError: (error: unknown) => void,
  actions: {
    fit(): boolean;
    resetZoom(): void;
    onState(state: { busy: boolean; available: boolean }): void;
    onValidated?(): void;
  },
) {
  let wasEmpty = true;
  const lifetime = editorLifetime(signal, (state) =>
    actions.onState({
      ...state,
      available: state.available && !wasEmpty,
    }),
  );
  let revision = 0,
    canvasRevision = 0,
    needsIdentityReview = false,
    acceptedKet: string | null = null,
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
    return !needsFit;
  }
  async function commit(
    prepared: string,
    expectedKey: string | null,
    current: () => boolean,
  ) {
    const failures = lifetime.failures,
      beforeRevision = canvasRevision;
    retained ??= await native.getKet();
    signal.throwIfAborted();
    if (!current() || beforeRevision !== canvasRevision) return false;
    if (failures !== lifetime.failures)
      throw new Error("编辑器未能确认载入结果，请保留原始文件并重试。");
    committing = true;
    let revalidate = false;
    try {
      await native.setMolecule(prepared);
      signal.throwIfAborted();
      const observedRevision = canvasRevision;
      const actual = await native.getKet();
      const actualKey = expectedKey === null ? null : await key(actual);
      signal.throwIfAborted();
      if (!current() || observedRevision !== canvasRevision) {
        revalidate = true;
        return false;
      }
      if (
        failures !== lifetime.failures ||
        hasNonDonorHydrogens(actual) ||
        spatial(actual) ||
        (expectedKey === null ? present(actual) : actualKey !== expectedKey)
      )
        throw new Error("编辑器未能确认载入结果，请保留原始文件并重试。");
      acceptedKet = actual;
      retained = null;
      needsIdentityReview = false;
      wasEmpty = !present(actual);
      if (wasEmpty) {
        actions.resetZoom();
        needsFit = false;
      } else fit();
      lifetime.accept();
      if (!signal.aborted) actions.onValidated?.();
      return true;
    } finally {
      committing = false;
      if (revalidate && !signal.aborted) changed();
    }
  }
  const failed = () => {
    retained ??= acceptedKet;
    needsIdentityReview = true;
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
    setMolecule: (value) => native.setMolecule(value),
  };
  configureKetcherPreview(display);
  // The public native change event cannot distinguish edits from Undo/Redo.
  // Validate only: appending automatic replacements here would trap history.
  const validateDrawing = async () => {
    if (committing || signal.aborted) return;
    const eventFailures = lifetime.failures;
    const observedRevision = canvasRevision;
    const observed = await native.getKet();
    if (
      committing ||
      signal.aborted ||
      observedRevision !== canvasRevision ||
      (observed === acceptedKet && lifetime.valid) ||
      eventFailures !== lifetime.failures
    )
      return;
    if (!hasNonDonorHydrogens(observed) && !spatial(observed)) {
      // Do not suspend native drawing/dragging for an unchanged display policy.
      const empty = !present(observed);
      if (needsIdentityReview && !empty) await key(observed);
      if (
        signal.aborted ||
        committing ||
        observedRevision !== canvasRevision ||
        eventFailures !== lifetime.failures
      )
        return;
      if ((wasEmpty || needsFit) && !empty) fit();
      acceptedKet = observed;
      retained = null;
      wasEmpty = empty;
      needsIdentityReview = false;
      lifetime.accept();
      if (!signal.aborted) actions.onValidated?.();
      return;
    }
    retained = observed;
    lifetime.fail();
    onError(new Error("请整理为二维结构，原始结构与撤销记录已保留。"));
  };
  let checking = false,
    pending = false;
  const changed = () => {
    if (signal.aborted) return;
    canvasRevision++;
    lifetime.invalidate();
    if (committing) return;
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
  const load = (source: string) => {
    const intent = ++revision;
    return lifetime.run(async () => {
      if (source.length > 5 * 1024 ** 2) throw new Error("分子文件超过 5 MB。");
      if (intent !== revision) return false;
      const observedRevision = canvasRevision,
        failures = lifetime.failures;
      const before = await native.getKet();
      retained ??= before;
      const expected = source.trim() ? await key(source) : null;
      const prepared = source.trim()
        ? await foldDisplayHydrogens(display, source)
        : EMPTY;
      if (source.trim() && spatial(prepared))
        throw new Error("绘图组件未能生成二维结构，已保留原始结构。");
      signal.throwIfAborted();
      if (intent !== revision || before !== (await native.getKet()))
        return false;
      if (expected !== null && (await key(prepared)) !== expected)
        throw new Error("显示转换不能保持分子身份，已保留原始结构。");
      signal.throwIfAborted();
      if (intent !== revision || observedRevision !== canvasRevision)
        return false;
      if (failures !== lifetime.failures)
        throw new Error("编辑器未能确认载入结果，请保留原始文件并重试。");
      const applied = await commit(
        prepared,
        expected,
        () => intent === revision,
      );
      return applied && !signal.aborted && intent === revision;
    });
  };
  const fitWhenVisible = (resized = false) => {
    if (signal.aborted) return false;
    if (resized) needsFit = true;
    if (needsFit && lifetime.valid && !wasEmpty) return fit();
    return false;
  };
  return {
    failed,
    fitWhenVisible,
    resize: editorResize(fitWhenVisible),
    load,
    retainedDrawing() {
      const value = retained ?? acceptedKet;
      return value && present(value) ? value : null;
    },
    async recheck() {
      return load(retained ?? (await native.getKet()));
    },
  };
}
