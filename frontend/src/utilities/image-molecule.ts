export interface ImageMolecule {
  smiles: string;
  molfile: string;
}
export function recognitionOrigin() {
  return `http://${location.hostname === "localhost" ? "localhost" : "127.0.0.1"}:8940`;
}
export function validImage(file: File) {
  return (
    file.size > 0 &&
    file.size <= 10 * 1024 ** 2 &&
    /^(image\/(png|jpeg|webp|bmp))$/.test(file.type)
  );
}
export function validImageMolecule(value: unknown): value is ImageMolecule {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ImageMolecule>;
  return (
    typeof item.smiles === "string" &&
    item.smiles.trim().length > 0 &&
    item.smiles.length <= 200000 &&
    typeof item.molfile === "string" &&
    item.molfile.length <= 2 * 1024 ** 2 &&
    /^M  END\s*$/m.test(item.molfile) &&
    !item.molfile.includes("$$$$")
  );
}
export async function imageMoleculeFile(
  value: ImageMolecule,
  image: File,
  suffix = ".sdf",
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await image.arrayBuffer(),
  );
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  signal?.throwIfAborted();
  const content =
    suffix === ".mol"
      ? value.molfile
      : `${value.molfile.trimEnd()}\n> <XDDE_INPUT_METHOD>\nReviewed structure image\n\n> <XDDE_IMAGE_SHA256>\n${hash}\n\n$$$$\n`;
  return new File([content], "image-structure" + suffix, {
    type: "chemical/x-mdl-sdfile",
  });
}
