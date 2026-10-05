"""Derive PDB inputs for PDB-only programs without renaming scientific identities."""

from pathlib import Path

from native_io import input_file


def input_pdb(request, role="structure"):
    source, reference = input_file(request, role)
    if source.suffix == ".pdb":
        return source, reference
    from Bio.PDB import PDBIO, MMCIFParser

    structure = MMCIFParser(QUIET=True).get_structure("input", source)
    models = list(structure.get_models())
    if len(models) != 1:
        raise ValueError("Select one structural model before this calculation.")
    if any(len(chain.id) != 1 for chain in models[0]):
        raise ValueError("Prepare single-character author chain identifiers before PDB conversion.")
    destination = Path("/output/native-inputs")
    destination.mkdir(exist_ok=True)
    file = destination / (role + ".pdb")
    writer = PDBIO()
    writer.set_structure(structure)
    # PDBIO rejects unrepresentable residue/atom numbers rather than silently renumbering.
    writer.save(str(file))
    return file, reference
