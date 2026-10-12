import type { NativeInteraction } from "../integrations/types";
import { nativeInteractions } from "../viewer/scientific-data";

export interface ProlifContact {
  label: string;
  kind: string;
  residue: {
    chain: string;
    name: string;
    number: number;
    insertion_code?: string;
  };
  distance: number;
  occurrences: number;
  start?: number[];
  end?: number[];
}

const kinds: Record<string, string> = {
  hydrogen_bond: "hydrogen_bond",
  hydrophobic: "hydrophobic",
  pi_stacking: "pi_stack",
  salt_bridge: "salt_bridge",
};

/** Coordinate adaptation only: never reconstruct missing chemical endpoints. */
export function prolifContacts(rows: ProlifContact[]): {
  contacts?: NativeInteraction[];
  unavailable: boolean;
} {
  if (rows.some((row) => row.start === undefined || row.end === undefined))
    return { unavailable: true };
  const contacts = rows.map((row) => {
    if (!Object.hasOwn(kinds, row.kind))
      throw new Error("Unsupported native chemical contact type");
    return {
      kind: kinds[row.kind],
      chain: row.residue.chain,
      residue: row.residue.name,
      number: row.residue.number,
      insertion_code: row.residue.insertion_code ?? "",
      ligand_position: row.start,
      protein_position: row.end,
      distance: row.distance,
    };
  });
  return { contacts: nativeInteractions(contacts), unavailable: false };
}
