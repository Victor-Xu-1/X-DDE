import { api } from "../api";
import type { Asset } from "../operations/types";
import type { ScientificObject } from "../research/types";

/** Only the native MOL header timestamp is volatile; source bytes are never rewritten. */
function saveIdentity(mol: string) {
  const lines = mol.split(/\r?\n/);
  if (/V(?:2000|3000)\s*$/.test(lines[3] ?? ""))
    lines[1] = lines[1].replace(
      /^(.{10})\d{10}([23]D.*)$/,
      (_match, program: string, dimension: string) =>
        program + "0000000000" + dimension,
    );
  return lines.join("\n");
}

interface SaveContext {
  kind: "molecule";
  label: string;
  parent_id: string | null;
  relation: "edited_from";
  notes: string;
  rating: number;
}
interface PendingSave {
  fingerprint: string;
  key: string;
  asset?: Asset;
  work?: Promise<ScientificObject>;
}

/** One immutable upload and version request per edit, including uncertain responses. */
export class MoleculeSaveIntent {
  private pending: PendingSave | null = null;
  private saved: { identity: string; id: string } | null = null;

  save(
    mol: string,
    parent: ScientificObject | null,
  ): Promise<ScientificObject> {
    const identity = saveIdentity(mol);
    if (
      parent &&
      this.saved?.id === parent.id &&
      this.saved.identity === identity
    )
      return Promise.resolve(parent);
    const context: SaveContext = {
      kind: "molecule",
      label: parent
        ? parent.label.slice(0, 113) + " · edit"
        : "sketched-molecule.sdf",
      parent_id: parent?.id ?? null,
      relation: "edited_from",
      notes: parent?.notes ?? "",
      rating: parent?.rating ?? 0,
    };
    const fingerprint = JSON.stringify([identity, context]);
    if (this.pending?.fingerprint !== fingerprint)
      this.pending = { fingerprint, key: crypto.randomUUID() };
    const intent = this.pending;
    if (!intent.work)
      intent.work = this.persist(mol, context, intent)
        .then((result) => {
          if (this.pending === intent) this.saved = { identity, id: result.id };
          return result;
        })
        .catch((error: unknown) => {
          // Keep a confirmed upload for retry; never keep a failed operation locked.
          intent.work = undefined;
          throw error;
        });
    return intent.work;
  }

  private async persist(
    mol: string,
    context: SaveContext,
    intent: PendingSave,
  ) {
    intent.asset ??= await api.upload(
      new File([mol + "\n$$$$\n"], "sketched-molecule.sdf", {
        type: "chemical/x-mdl-sdfile",
      }),
      "ligand",
    );
    return api.post<ScientificObject>(
      "/research/objects",
      { ...context, asset_id: intent.asset.id },
      intent.key,
    );
  }
}
