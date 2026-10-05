"""Compile author residue choices to a derived BoltzGen framework with ordinal masks."""

from native_io import input_file


def scaffold_entity(request, raw, reserved):
    import yaml
    from Bio.PDB import MMCIFIO, MMCIFParser, PDBParser

    source, _ = input_file(request, "scaffold")
    parser = MMCIFParser(QUIET=True) if source.suffix == ".cif" else PDBParser(QUIET=True)
    structure = parser.get_structure("scaffold", source)
    models = list(structure.get_models())
    if len(models) != 1:
        raise ValueError("Select one framework structural model.")
    payload = request["payload"]
    model = models[0]
    chain = model[payload["scaffold_chain"]]
    residues = list(chain)
    if any(r.id[0] != " " for r in residues):
        raise ValueError("Prepare a protein-only framework chain before design.")
    identities = {f"{chain.id}{r.id[1]}{r.id[2].strip()}": i for i, r in enumerate(residues, 1)}
    selected = payload["scaffold_residues"]
    if len(set(selected)) != len(selected) or not set(selected) <= identities.keys():
        raise ValueError("Selected framework residues do not match the original structure.")
    ordinal = ",".join(str(identities[r]) for r in selected)
    for other in list(model):
        if other.id != chain.id:
            model.detach_child(other.id)
    replacement = next(c for c in "ZYXWVUTSRQPONMLKJIHGFEDCBA" if c not in reserved)
    chain.id = replacement
    coordinates = raw / "framework.cif"
    writer = MMCIFIO()
    writer.set_structure(structure)
    writer.save(str(coordinates))
    config = {
        "path": str(coordinates),
        "include": [{"chain": {"id": replacement}}],
        "design": [{"chain": {"id": replacement, "res_index": ordinal}}],
        "structure_groups": [
            {"group": {"id": replacement, "visibility": 2}},
            {"group": {"id": replacement, "visibility": 0, "res_index": ordinal}},
        ],
    }
    file = raw / "framework.yaml"
    file.write_text(yaml.safe_dump(config, sort_keys=False), encoding="utf-8")
    return {"file": {"path": str(file)}}
