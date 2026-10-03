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
export function isResearchFile(name: string) {
  const base = name.replaceAll("\\", "/").split("/").at(-1) ?? "";
  const extension = base.split(".").at(-1)?.toLowerCase() ?? "";
  return researchExtensions.has(extension) && !internalName.test(base);
}
export function researchFileLabel(name: string, zh: boolean) {
  const base = name.replaceAll("\\", "/").split("/").at(-1) ?? name,
    ext = base.split(".").at(-1)?.toUpperCase() ?? "";
  const numbered = /^pose[-_](\d+)/i.exec(base);
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
