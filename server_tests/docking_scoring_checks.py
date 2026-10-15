"""Real RDKit SDF controls inside the frozen GNINA adapter, with no host chemistry mocks."""

import json
import tempfile
from pathlib import Path

from chemistry import molecule, summarize_poses
from options import DockingOptions
from rdkit import Chem
from rdkit.Chem import AllChem


def reject_incomplete(file, original, options):
    try:
        summarize_poses(file, original, options)
    except ValueError:
        return
    raise AssertionError("Incomplete native scoring was accepted as a completed calculation.")


def write(path, mol):
    with Chem.SDWriter(str(path)) as writer:
        writer.write(mol)


def main():
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        initial = Chem.AddHs(Chem.MolFromSmiles("NC(=O)c1ccccc1"))
        assert AllChem.EmbedMolecule(initial, randomSeed=2026) == 0
        assert AllChem.MMFFOptimizeMolecule(initial) == 0
        write(root / "source.sdf", initial)
        original = molecule(root / "source.sdf", 0, require_pose=True)
        output = root / "poses.sdf"
        values = {"minimizedAffinity": "-6.2", "CNNscore": "0.53", "CNNaffinity": "6.99"}
        checked = []
        for stage in ("rescore", "refinement", "all"):
            options = DockingOptions(cnn_scoring=stage, use_gpu=True)
            native = Chem.Mol(original)
            for name, value in values.items():
                native.SetProp(name, value)
            write(output, native)
            poses = summarize_poses(output, original, options)
            assert poses[0]["valid"] and {s["name"] for s in poses[0]["scores"]} == set(values)
            for missing in values:
                incomplete = Chem.Mol(native)
                incomplete.ClearProp(missing)
                write(output, incomplete)
                reject_incomplete(output, original, options)
            for invalid in ("NaN", "inf", "invalid"):
                incomplete = Chem.Mol(native)
                incomplete.SetProp("CNNscore", invalid)
                write(output, incomplete)
                reject_incomplete(output, original, options)
            checked.append(stage)
        write(output, native)
        empirical = summarize_poses(output, original, DockingOptions())
        assert [s["name"] for s in empirical[0]["scores"]] == ["minimizedAffinity"]
        different = molecule(root / "source.sdf", 0, require_pose=True)
        different.GetAtomWithIdx(0).SetIsotope(15)
        write(output, different)
        rejected = summarize_poses(output, original, DockingOptions(cnn_scoring="rescore"))
        assert not rejected[0]["valid"] and rejected[0]["scores"] == []
        assert "Chemical identity" in rejected[0]["reason"]
        print(
            json.dumps(
                {
                    "scoring_stages": checked,
                    "missing_or_nonfinite_requested_scores": "engine failure",
                    "chemical_mismatch": "rejected pose",
                    "empirical_only_contract": "preserved",
                }
            )
        )


if __name__ == "__main__":
    main()
