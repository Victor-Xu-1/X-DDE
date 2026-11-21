import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Language } from "../types";
import type { MoleculeRef } from "../research/types";
import { useAssetUpload } from "../operations/useAssetUpload";
import {
  ImageMoleculeInput,
  type ImageInputTarget,
} from "./ImageMoleculeInput";
import { ImageInputSourceContext } from "./ImageInputSource";
import {
  editorMoleculeFile,
  imageMoleculeFile,
  type ImageMolecule,
} from "./image-molecule";
import { researchError } from "../presentation/research-content";
import { TaskPresentationContext } from "../guided/TaskPresentation";
import { useInputActionScope } from "../guided/InputActionScope";
import {
  UtilityDrawingContext,
  type UtilityDrawingOffer,
} from "./UtilityDrawingContext";

export type UtilityImageValue = { reference: MoleculeRef; key: string };
const formats = [".sdf"] as const;

/** Each native form owns its image input, including forms opened from results. */
export function UtilityFormImage({
  language,
  children,
}: {
  language: Language;
  children(value: UtilityImageValue | null): ReactNode;
}) {
  const presentation = useContext(TaskPresentationContext);
  const drawing = useContext(UtilityDrawingContext);
  const [value, setValue] = useState<UtilityImageValue | null>(null);
  if (presentation?.imageEntry !== "workspace") return children(null);
  return (
    <UtilityImageInput
      language={language}
      active={presentation.active !== false}
      value={value?.reference.asset_id ?? ""}
      onLoaded={setValue}
      drawing={drawing}
    >
      {children(value)}
    </UtilityImageInput>
  );
}

/** One image entry reuses native upload and chemical validation for one molecule. */
export function UtilityImageInput({
  language,
  active,
  value,
  onLoaded,
  target = "molecule",
  pasteLabel,
  drawing,
  children,
}: {
  language: Language;
  active: boolean;
  value: string;
  onLoaded(value: UtilityImageValue): void;
  target?: ImageInputTarget;
  pasteLabel?: string;
  drawing?: UtilityDrawingOffer | null;
  children: ReactNode;
}) {
  const source = useRef(new AbortController());
  const scope = useInputActionScope();
  const importAttempt = useRef<AbortController | null>(null);
  const uploadButton = useRef<HTMLButtonElement>(null);
  const acceptDrawing = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef<"upload" | "drawing" | null>(null);
  const getSourceSignal = useCallback(() => source.current.signal, []);
  const replaceSource = useCallback(() => {
    source.current.abort();
    source.current = new AbortController();
  }, []);
  const [review, setReview] = useState<{
    molecule: ImageMolecule;
    image: File;
  } | null>(null);
  const upload = useAssetUpload(
    "ligand",
    formats,
    8 * 1024 ** 2,
    value,
    () => {},
    (asset) => {
      replaceSource();
      onLoaded({
        reference: {
          asset_id: asset.id,
          sha256: asset.sha256,
          record: 0,
          conformer: 0,
        },
        key: crypto.randomUUID(),
      });
    },
  );
  useEffect(() => {
    if (source.current.signal.aborted) source.current = new AbortController();
    return () => source.current.abort();
  }, []);
  useLayoutEffect(
    () => () => importAttempt.current?.abort(),
    [active, drawing?.id],
  );
  useLayoutEffect(() => {
    if (!active) restoreFocus.current = null;
    if (!restoreFocus.current || upload.busy || scope?.action) return;
    const target =
      restoreFocus.current === "drawing" ? acceptDrawing : uploadButton;
    restoreFocus.current = null;
    target.current?.focus();
  }, [active, drawing, upload.busy, scope?.action]);
  async function importDrawing(offer: UtilityDrawingOffer) {
    if (!active || upload.busy || importAttempt.current) return;
    const finish = scope?.begin("structure-import");
    if (scope && !finish) return;
    const attempt = new AbortController();
    importAttempt.current = attempt;
    try {
      if (
        await upload.upload(editorMoleculeFile(offer.molecule), {
          preserveSelection: true,
          signal: attempt.signal,
        })
      ) {
        restoreFocus.current = "upload";
        setReview(null);
        offer.dismiss(offer.id);
      } else if (!attempt.signal.aborted) restoreFocus.current = "drawing";
    } finally {
      if (importAttempt.current === attempt) importAttempt.current = null;
      finish?.();
    }
  }
  const zh = language === "zh";
  return (
    <ImageInputSourceContext.Provider value={getSourceSignal}>
      <ImageMoleculeInput
        className={
          target === "molecule"
            ? "utility-image-entry"
            : "utility-screen-image-entry"
        }
        language={language}
        target={target}
        pasteLabel={pasteLabel}
        uploadButton={uploadButton}
        enabled={active}
        disabled={upload.busy}
        inputOwner
        controlsFirst={target === "molecule"}
        automatic
        cancelOnEdit
        review={review ?? undefined}
        onSourceEdit={() => setReview(null)}
        onImageSelected={(editing) => {
          if (!editing) replaceSource();
        }}
        onMolecule={async (molecule, image, signal) => {
          const file = await imageMoleculeFile(molecule, image, ".sdf", signal);
          signal.throwIfAborted();
          if (!(await upload.upload(file, { preserveSelection: true, signal })))
            throw new Error("Image input upload was not accepted");
          if (!signal.aborted) setReview({ molecule, image });
        }}
      >
        {drawing && (
          <div
            className="utility-drawing-offer"
            role="group"
            aria-label={zh ? "待用绘图" : "Drawing ready"}
          >
            <span>
              {zh
                ? "来自分子编辑器的绘图"
                : "Drawing from the molecular editor"}
            </span>
            <button
              ref={acceptDrawing}
              className="secondary-button"
              type="button"
              disabled={!active || upload.busy || Boolean(scope?.action)}
              onClick={() => void importDrawing(drawing)}
            >
              {upload.busy
                ? zh
                  ? "正在添加…"
                  : "Adding…"
                : target === "query"
                  ? zh
                    ? "用作参照分子"
                    : "Use as query"
                  : zh
                    ? "用作输入"
                    : "Use as input"}
            </button>
            <button
              className="text-button"
              type="button"
              disabled={!active || upload.busy || Boolean(scope?.action)}
              onClick={() => {
                restoreFocus.current = "upload";
                drawing.dismiss(drawing.id);
                upload.clearError();
              }}
            >
              {zh ? "忽略" : "Dismiss"}
            </button>
          </div>
        )}
        {upload.error && (
          <p role="alert" className="error-box">
            {researchError(upload.error, language === "zh")}
          </p>
        )}
        {children}
      </ImageMoleculeInput>
    </ImageInputSourceContext.Provider>
  );
}
