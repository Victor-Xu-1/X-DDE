/** The UI presents research deliverables; technical records stay on the server. */
const researchExtensions = new Set([
  "pdb",
  "cif",
  "mmcif",
  "pdbqt",
  "sdf",
  "mol",
  "mol2",
  "smi",
  "smiles",
  "fasta",
  "fa",
  "faa",
  "fna",
  "a3m",
  "hhr",
  "csv",
  "tsv",
  "xlsx",
  "pdf",
  "html",
  "png",
  "jpg",
  "jpeg",
  "svg",
  "zip",
]);
const internalName =
  /(?:^|[_.-])(manifest|provenance|environment|audit|diagnostic|stdout|stderr|bindings|checkpoint|execution|request|verification|runtime[_.-]lock)(?:[_.-]|$)/i;
const scientificJSON = new Map([
  ["del-definition.json", ["DEL 库定义", "DEL library definition"]],
  ["barcode-review.json", ["条码质量", "Barcode quality"]],
]);
const alignmentNames = new Map([
  ["non_pairing.a3m", ["非配对序列比对", "Unpaired sequence alignment"]],
  ["pairing.a3m", ["配对序列比对", "Paired sequence alignment"]],
  ["hmmsearch.a3m", ["结构模板比对", "Structural template alignment"]],
  ["uniref.a3m", ["UniRef 序列比对", "UniRef sequence alignment"]],
  [
    "bfd.mgnify30.metaeuk30.smag30.a3m",
    ["环境与宏基因组序列比对", "Environmental sequence alignment"],
  ],
]);
export function isResearchFile(name: string) {
  const base = name.replaceAll("\\", "/").split("/").at(-1) ?? "";
  const extension = base.split(".").at(-1)?.toLowerCase() ?? "";
  return (
    (researchExtensions.has(extension) || scientificJSON.has(base)) &&
    !isInternalResearchFile(name)
  );
}
export function isInternalResearchFile(name: string) {
  const path = name.replaceAll("\\", "/");
  if (
    /^(?:native-inputs\/|native\/(?:backbones|packed|msas)\/|native-packed-\d+\.pdb$)/.test(
      path,
    )
  )
    return true;
  return internalName.test(path.split("/").at(-1) ?? "");
}
export function researchFileLabel(name: string, zh: boolean) {
  const base = name.replaceAll("\\", "/").split("/").at(-1) ?? name,
    ext = base.split(".").at(-1)?.toUpperCase() ?? "";
  const numbered = /^pose[-_](\d+)/i.exec(base);
  if (scientificJSON.has(base))
    return scientificJSON.get(base)![zh ? 0 : 1] + " · JSON";
  if (ext === "A3M")
    return (
      (alignmentNames.get(base.toLowerCase()) ?? [
        "序列比对",
        "Sequence alignment",
      ])[zh ? 0 : 1] + " · A3M"
    );
  if (ext === "HHR")
    return (zh ? "结构模板匹配" : "Structural template matches") + " · HHR";
  if (numbered)
    return (
      (zh ? "结合姿势 " : "Binding pose ") + Number(numbered[1]) + " · " + ext
    );
  const role = ["PDB", "CIF", "MMCIF", "PDBQT"].includes(ext)
    ? ["三维结构", "3D structure"]
    : ["SDF", "MOL", "MOL2", "SMI", "SMILES"].includes(ext)
      ? ["分子结构", "Molecule structures"]
      : ["FASTA", "FA", "FAA", "FNA"].includes(ext)
        ? ["序列", "Sequences"]
        : ["CSV", "TSV", "XLSX"].includes(ext)
          ? ["结果表格", "Result table"]
          : ["研究文件", "Research file"];
  return role[zh ? 0 : 1] + " · " + ext;
}

const internalKeys = new Set([
  "metadata",
  "provenance",
  "versions",
  "files",
  "artifacts",
  "manifest",
  "environment",
  "implementation",
  "execution_backend",
  "schema_version",
  "command",
  "stdout",
  "stderr",
  "input_bindings",
  "runtime_lock",
  "dependencies",
  "parser_version",
  "native_version",
  "raw_result",
  "job_id",
  "task_id",
  "progress",
  "server_url",
  "server_mode",
  "cached",
  "cdr_source",
  "runtime_seconds",
  "selected_skill",
  "service",
  "endpoint",
]);
export function isResearchField(key: string) {
  return (
    !internalKeys.has(key.toLowerCase()) &&
    !/(?:^|_)(?:sha256|digest|checksum|path|directory|dir|log|token|cache)(?:_|$)/i.test(
      key,
    )
  );
}
