import { useEffect, useState } from "react";
import { MoleculeImage } from "../presentation/MoleculeImage";
import type { MoleculeRef } from "../research/types";
import type { Language } from "../types";

export function FepLigandSelection({
  source,
  selected,
  onChange,
  language,
}: {
  source: MoleculeRef | null;
  selected: number[];
  onChange(records: number[]): void;
  language: Language;
}) {
  const zh = language === "zh";
  const [names, setNames] = useState<string[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setNames([]);
    setError("");
    if (!source) return;
    void fetch(`/api/assets/${source.asset_id}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            zh ? "无法读取分子文件" : "Cannot read the ligand file",
          );
        const text = await response.text();
        if (text.length > 25 * 1024 ** 2)
          throw new Error(
            zh ? "请选择更小的分子系列" : "Choose a smaller molecular series",
          );
        const records = text
          .split(/\$\$\$\$/)
          .filter(
            (block, index, all) => index < all.length - 1 || block.trim(),
          );
        if (records.length > 500)
          throw new Error(
            zh
              ? "请先导出不超过 500 个分子的子集"
              : "Export a subset of up to 500 molecules first",
          );
        if (!controller.signal.aborted)
          setNames(
            records.map(
              (block, index) =>
                block
                  .replace(/^\r?\n/, "")
                  .split(/\r?\n/)[0]
                  .trim() || `${zh ? "分子" : "Molecule"} ${index + 1}`,
            ),
          );
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : String(e));
      });
    return () => controller.abort();
  }, [source?.asset_id, source?.sha256, zh]);
  return (
    <section aria-label={zh ? "选择 FEP 分子" : "Select FEP molecules"}>
      <p className="field-help">
        {zh
          ? "选择 2–12 个同系列分子。使用已在同一个蛋白坐标系中对齐的结合姿势。"
          : "Select 2–12 congeneric molecules with binding poses aligned in the same protein frame."}
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="simulation-ligand-grid">
        {names.map((name, record) => (
          <label
            key={record}
            className={selected.includes(record) ? "is-selected" : ""}
          >
            <span>
              <input
                type="checkbox"
                checked={selected.includes(record)}
                disabled={!selected.includes(record) && selected.length >= 12}
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? [...selected, record].sort((a, b) => a - b)
                      : selected.filter((r) => r !== record),
                  )
                }
              />
              {name}
            </span>
            <MoleculeImage
              compact
              source={
                source
                  ? { url: `/api/assets/${source.asset_id}`, record }
                  : null
              }
              language={language}
              label={name}
            />
          </label>
        ))}
      </div>
      <output>
        {selected.length} / 12 {zh ? "已选择" : "selected"}
      </output>
    </section>
  );
}
