import { useEffect, useState } from "react";
import { useExampleReference } from "../examples/context";
import { AssetPicker } from "../operations/AssetPicker";
import { useSdfAsset } from "../research/useSdfAsset";
import { Questionnaire } from "../guided/Questionnaire";
import { Hint } from "../guided/Hint";
import { useTaskSubmit } from "../operations/useTaskSubmit";
import { useTaskReadiness } from "../guided/useTaskReadiness";
import type { Job, Language } from "../types";
import type { MoleculeRef } from "../research/types";
import {
  ScreenPurpose,
  ScreenSettings,
  ScreenReview,
} from "./LibraryScreenQuestions";
import {
  screenDefaults,
  type LibraryRef,
  type ScreenOptions,
} from "./screen-types";

export function LibraryScreenForm({
  language,
  onCreated,
}: {
  language: Language;
  onCreated(job: Job): void;
}) {
  const exampleLibrary = useExampleReference("library");
  const zh = language === "zh",
    run = useTaskSubmit(onCreated),
    availability = useTaskReadiness("chemistry.screen"),
    input = useSdfAsset(language);
  useEffect(() => {
    if (exampleLibrary) void input.choose(exampleLibrary.asset_id);
  }, [exampleLibrary?.asset_id, input.choose]);
  const library: LibraryRef | null = input.asset
      ? { asset_id: input.asset.id, sha256: input.asset.sha256 }
      : null,
    libraryName = input.asset?.name ?? "",
    loading = input.loading,
    error = input.error;
  const [query, setQuery] = useState<MoleculeRef | null>(null),
    [options, setOptions] = useState<ScreenOptions>({ ...screenDefaults }),
    [name, setName] = useState("");
  const requiresQuery =
      options.mode === "similarity" || options.mode === "substructure",
    selectedQuery = requiresQuery ? query : null;
  function configure(change: Partial<ScreenOptions>) {
    setOptions((value) => ({ ...value, ...change }));
  }
  const settingsValid =
    Number.isInteger(options.max_selected) &&
    options.max_selected >= 1 &&
    options.max_selected <= 100 &&
    options.minimum_similarity >= 0 &&
    options.minimum_similarity <= 1 &&
    options.minimum_mw <= options.maximum_mw &&
    options.minimum_logp <= options.maximum_logp &&
    Number.isInteger(options.seed) &&
    options.seed >= 1 &&
    options.seed <= 2147483647;
  return (
    <Questionnaire
      language={language}
      ready={availability.ready}
      busy={run.busy || loading}
      error={run.error || error || availability.error}
      unavailable={
        zh
          ? "请在安装与组件配置独立化学处理环境。"
          : "Configure the independent chemistry environment in Installation & components."
      }
      submitLabel={zh ? "开始分子库筛选" : "Run library selection"}
      onSubmit={() =>
        run.submit({
          operation: "library_screen",
          name:
            name.trim() || (zh ? "早期分子库筛选" : "Early library selection"),
          library: library!,
          query: selectedQuery,
          scientific_inputs: selectedQuery ? [selectedQuery] : [],
          options,
        })
      }
      steps={[
        {
          title: zh ? "选择分子库" : "Choose a library",
          valid: Boolean(library) && !loading,
          content: (
            <>
              <AssetPicker
                language={language}
                label={zh ? "SDF 分子库文件" : "SDF molecular library file"}
                kind="ligand"
                allowedSuffixes={[".sdf"]}
                value={library?.asset_id ?? ""}
                onChange={(id) => void input.choose(id)}
              />
              <Hint
                label={
                  zh
                    ? "处理一个还是全部分子？"
                    : "One molecule or the whole file?"
                }
              >
                {zh
                  ? "处理所选文件的全部记录，最多500条；保留失败和原始编号。参照步骤选择单个分子的确切版本。"
                  : "Reads every record in the selected file, at most500. Failures and original indices remain. Choose an exact query molecular version in the relevant step."}
              </Hint>
            </>
          ),
        },
        {
          title: zh ? "选择用途" : "Choose purpose",
          valid: !requiresQuery || Boolean(query),
          content: (
            <ScreenPurpose
              language={language}
              mode={options.mode}
              onMode={(mode) => {
                configure({ mode });
                setQuery(null);
              }}
              query={query}
              onQuery={setQuery}
            />
          ),
        },
        {
          title: zh ? "选择范围" : "Choose limits",
          valid: settingsValid,
          content: (
            <ScreenSettings
              language={language}
              options={options}
              onChange={configure}
              name={name}
              onName={setName}
            />
          ),
        },
        {
          title: zh ? "确认筛选" : "Review selection",
          valid:
            Boolean(library) &&
            (!requiresQuery || Boolean(query)) &&
            settingsValid,
          content: (
            <ScreenReview
              language={language}
              libraryName={libraryName}
              query={selectedQuery}
              options={options}
            />
          ),
        },
      ]}
    />
  );
}
