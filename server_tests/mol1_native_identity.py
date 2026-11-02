"""Small native-parser and writable-preparation regressions inside the real image."""

import hashlib
import inspect
import json
from pathlib import Path
from unittest.mock import patch

from mol.runner.batch_inference import inference_jsons
from mol.runner.msa_search import update_infer_json
from native_mol1 import inference_options
from native_mol1_bonds import file_atom_names
from rdkit import Chem
from rdkit.Chem import AllChem


def main():
    root = Path("/tmp/identity")
    root.mkdir()
    molecule = Chem.MolFromSmiles("O=C1CCC(N2C(=O)c3cccc(N)c3C2=O)N1")
    for atom in molecule.GetAtoms():
        atom.SetAtomMapNum(atom.GetIdx() + 1)
    molecule = Chem.AddHs(molecule)
    assert AllChem.EmbedMolecule(molecule, randomSeed=101) == 0
    # Put an explicit hydrogen before the heavy atoms to exercise index removal.
    hydrogen = next(a.GetIdx() for a in molecule.GetAtoms() if a.GetAtomicNum() == 1)
    molecule = Chem.RenumberAtoms(
        molecule, [hydrogen, *[i for i in range(molecule.GetNumAtoms()) if i != hydrogen]]
    )
    file = root / "mapped.sdf"
    with Chem.SDWriter(str(file)) as writer:
        writer.write(molecule)
    digest = hashlib.sha256(file.read_bytes()).hexdigest()
    names = file_atom_names(file)
    counts = {}
    for atom in molecule.GetAtoms():
        if atom.GetAtomicNum() == 1:
            assert atom.GetIdx() not in names
            continue
        symbol = atom.GetSymbol().upper()
        counts[symbol] = counts.get(symbol, 0) + 1
        assert names[atom.GetIdx()] == symbol + str(counts[symbol])
    assert hashlib.sha256(file.read_bytes()).hexdigest() == digest
    for atom in molecule.GetAtoms():
        atom.SetAtomMapNum(0)
    with Chem.SDWriter(str(file)) as writer:
        writer.write(molecule)
    assert file_atom_names(file) == names
    # This exercises the pinned public API signature without allocating model weights.
    payload = {
        "dtype": "fp32",
        "samples": 1,
        "cycles": 1,
        "steps": 1,
        "additional_seeds": [],
        "feature_mode": "none",
        "use_template": False,
        "use_rna_msa": False,
        "atom_confidence": True,
        "enable_tf32": False,
        "enable_fusion": True,
        "diffusion_cache_mode": "full",
        "attention_chunk": 512,
        "msa_chunk": 1024,
        "sample_chunk": 1,
        "msa_pair_as_unpair": False,
    }
    options = inference_options(
        {"payload": payload, "options": {"device": "cpu", "seed": 101}}, root / "input.json", root
    )
    inspect.signature(inference_jsons).bind(**options)
    source = root / "input.json"
    source.write_text(
        json.dumps(
            [
                {
                    "name": "source",
                    "sequences": [{"proteinChain": {"sequence": "PREACHINGS", "count": 1}}],
                }
            ]
        )
    )
    original = source.read_bytes()
    # Only the remote service result is controlled. The native JSON writer is real.
    with patch("mol.runner.msa_search.update_seq_msa"):
        updated, searched = update_infer_json(str(source), str(root), use_msa=True)
    assert searched and Path(updated).parent == root and Path(updated).is_file()
    assert source.read_bytes() == original
    print("Native file atoms, explicit-H removal, API options and MSA write path verified.")


if __name__ == "__main__":
    main()
