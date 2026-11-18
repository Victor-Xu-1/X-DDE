import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Language } from "../types";
import type { MoleculeRef } from "../research/types";
import { useAssetUpload } from "../operations/useAssetUpload";
import { ImageMoleculeInput } from "./ImageMoleculeInput";
import { ImageInputSourceContext } from "./ImageInputSource";
import { imageMoleculeFile, type ImageMolecule } from "./image-molecule";
import { researchError } from "../presentation/research-content";
import { TaskPresentationContext } from "../guided/TaskPresentation";

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
  const [value, setValue] = useState<UtilityImageValue | null>(null);
  if (presentation?.imageEntry !== "workspace") return children(null);
  return (
    <UtilityImageInput
      language={language}
      active={presentation.active !== false}
      value={value?.reference.asset_id ?? ""}
      onLoaded={setValue}
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
  query = false,
  children,
}: {
  language: Language;
  active: boolean;
  value: string;
  onLoaded(value: UtilityImageValue): void;
  query?: boolean;
  children: ReactNode;
}) {
  const source = useRef(new AbortController());
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
  return (
    <ImageInputSourceContext.Provider value={getSourceSignal}>
      <ImageMoleculeInput
        className={query ? "utility-query-image-entry" : "utility-image-entry"}
        language={language}
        enabled={active}
        disabled={upload.busy}
        inputOwner
        controlsFirst={!query}
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
