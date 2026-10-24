"""Prepare source-backed native binary controls inside the reviewed RDKit image."""

from pathlib import Path

from native_proximity_chemistry import fragment_from_indices
from rdkit import Chem


def main():
    full = Chem.RemoveHs(Chem.SDMolSupplier("/inputs/ligand.sdf", removeHs=False)[0])
    if full.GetNumAtoms() != 69:
        raise ValueError("The fixed official MZ1 control differs from its reviewed atom graph.")
    original = Chem.MolToSmiles(full, isomericSmiles=True)
    for variant in ("original", "translated"):
        output = Path("/output") / variant
        output.mkdir()
        for role, region in (("a", list(range(32))), ("b", list(range(42, 69)))):
            arm, mapping = fragment_from_indices(full, list(range(69)), region)
            if list(mapping) != region:
                raise ValueError("The official control changed its chemical atom correspondence.")
            with Chem.SDWriter(str(output / ("arm-" + role + ".sdf"))) as writer:
                writer.write(arm)
        whole = Chem.Mol(full)
        if variant == "translated":
            conformer = whole.GetConformer()
            for index, xyz in enumerate(conformer.GetPositions()):
                conformer.SetAtomPosition(index, xyz + [350.0, -120.0, 80.0])
        if Chem.MolToSmiles(whole, isomericSmiles=True) != original:
            raise ValueError("A coordinate-only control cannot change chemical identity.")
        with Chem.SDWriter(str(output / "ligand.sdf")) as writer:
            writer.write(whole)


if __name__ == "__main__":
    main()
