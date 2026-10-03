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
]);
export function isResearchField(key: string) {
  return (
    !internalKeys.has(key.toLowerCase()) &&
    !/(?:^|_)(?:sha256|digest|checksum|path|directory|dir|log|token|cache)(?:_|$)/i.test(
      key,
    )
  );
}
