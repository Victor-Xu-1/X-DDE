import { useContext, useLayoutEffect, useState } from "react";
import {
  UtilityImageInput,
  type UtilityImageValue,
} from "../utilities/UtilityImageInput";
import { UtilityDrawingContext } from "../utilities/UtilityDrawingContext";
import { TaskPresentationContext } from "../guided/TaskPresentation";
import { useExampleReference, useExampleTask } from "../examples/context";
import { AssetPicker } from "../operations/AssetPicker";
import { useSdfAsset } from "../research/useSdfAsset";
import { Questionnaire } from "../guided/Questionnaire";
import { Hint } from "../guided/Hint";
import { MolecularReview } from "../guided/MolecularReview";
import { useInputTaskSubmit } from "../guided/useInputTaskSubmit";
import { useTaskReadiness } from "../guided/useTaskReadiness";
import type { Job, Language } from "../types";
import type { MoleculeRef } from "../research/types";
import { ScreenPurpose, ScreenReview } from "./LibraryScreenQuestions";
import { ScreenSettings } from "./LibraryScreenSettings";
import {
  screenDefaults,
  type LibraryRef,
  type ScreenOptions,
} from "./screen-types";

export function LibraryScreenForm({
  language,
  onCreated,
  initialLibrary = null,
}: {
  language: Language;
  onCreated(job: Job): void;
  initialLibrary?: LibraryRef | null;
}) {
  const presentation = useContext(TaskPresentationContext);
  const drawing = useContext(UtilityDrawingContext);
  const workspace = presentation?.imageEntry === "workspace";
  const [imageInput, setImageInput] = useState<UtilityImageValue | null>(null);
  const exampleLibrary = useExampleReference("library");
  const preset = useExampleTask("library_screen");
  const zh = language === "zh",
    run = useInputTaskSubmit(onCreated),
    availability = useTaskReadiness("chemistry.screen"),
    input = useSdfAsset(language);
  useLayoutEffect(() => {
    const selected = initialLibrary ?? preset?.library ?? exampleLibrary;
    if (selected) void input.choose(selected.asset_id, selected.sha256);
  }, [
    initialLibrary?.asset_id,
    initialLibrary?.sha256,
    preset?.library.asset_id,
    exampleLibrary?.asset_id,
    input.choose,
  ]);
  const library: LibraryRef | null = input.asset
      ? { asset_id: input.asset.id, sha256: input.asset.sha256 }
      : null,
    libraryName = input.asset?.name ?? "",
    loading = input.loading,
    error = input.error;
  const [query, setQuery] = useState<MoleculeRef | null>(preset?.query ?? null),
    [options, setOptions] = useState<ScreenOptions>(() => ({
      ...screenDefaults,
      ...structuredClone(preset?.options ?? {}),
    })),
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
    Number.isInteger(options.per_scaffold) &&
    options.per_scaffold >= 1 &&
    options.per_scaffold <= 10 &&
    (options.mode !== "alerts" || options.alert_policy !== "off") &&
    Number.isInteger(options.seed) &&
    options.seed >= 1 &&
    options.seed <= 2147483647;
  const libraryPicker = (
    <AssetPicker
      language={language}
      label={zh ? "SDF 分子库文件" : "SDF molecular library file"}
      kind="ligand"
      allowedSuffixes={[".sdf"]}
      value={library?.asset_id ?? ""}
      onChange={(id) => void input.choose(id)}
      uploadKey={imageInput?.key}
    />
  );
  return (
    <Questionnaire
      language={language}
      inputKey={JSON.stringify({ library, selectedQuery, options, name })}
      ready={availability.ready}
      onCheckEnvironment={availability.recheck}
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
          content: workspace ? (
            <UtilityImageInput
              language={language}
              target="library"
              active={presentation.active !== false}
              value={library?.asset_id ?? ""}
              onLoaded={(value) => {
                setImageInput(value);
                void input.choose(
                  value.reference.asset_id,
                  value.reference.sha256,
                );
              }}
            >
              {libraryPicker}
            </UtilityImageInput>
          ) : (
            <>
              {libraryPicker}
              <Hint
                label={
                  zh
                    ? "处理一个还是全部分子？"
                    : "One molecule or the whole file?"
                }
              >
                {zh
                  ? "读取分子库全部记录（最多 500 条），结果保留原始编号。"
                  : "Read all library records (up to 500); results retain original record numbers."}
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
                configure({
                  mode,
                  ...(mode === "alerts" && options.alert_policy === "off"
                    ? { alert_policy: "warn" }
                    : {}),
                });
                setQuery(null);
              }}
              query={query}
              drawing={drawing}
              onQuery={(value) => {
                if (value && !requiresQuery) configure({ mode: "similarity" });
                setQuery(value);
              }}
            />
          ),
        },
        {
          title: zh ? "选择范围" : "Choose limits",
          inline: "options",
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
          inline: "preview",
          valid:
            Boolean(library) &&
            (!requiresQuery || Boolean(query)) &&
            settingsValid,
          content: (
            <MolecularReview
              language={language}
              source={
                selectedQuery
                  ? {
                      url: `/api/assets/${encodeURIComponent(selectedQuery.asset_id)}`,
                      record: selectedQuery.record,
                    }
                  : library
                    ? {
                        url: `/api/assets/${encodeURIComponent(library.asset_id)}`,
                        record: 0,
                      }
                    : null
              }
              caption={
                selectedQuery
                  ? zh
                    ? `参照分子 · 第 ${selectedQuery.record + 1} 条记录`
                    : `Query molecule · Record ${selectedQuery.record + 1}`
                  : zh
                    ? "分子库首条记录预览；筛选范围为整个文件"
                    : "First library record preview; selection covers the whole file"
              }
              summary={
                <ScreenReview
                  language={language}
                  libraryName={libraryName}
                  query={selectedQuery}
                  options={options}
                />
              }
            />
          ),
        },
      ]}
    />
  );
}
