"""Shared observed-model, chain and alternate selection; no execution or file writes."""

import math
import warnings


def read_selected(file, options):
    from Bio.PDB import MMCIFParser, PDBParser

    parser = (
        PDBParser(PERMISSIVE=False, QUIET=False)
        if file.suffix == ".pdb"
        else MMCIFParser(QUIET=False, auth_chains=True, auth_residues=True)
    )
    with warnings.catch_warnings(record=True) as warnings_found:
        warnings.simplefilter("always")
        structure = parser.get_structure("source", str(file))
    models = list(structure.get_models())
    if not 1 <= len(models) <= 100 or options.model_index >= len(models):
        raise ValueError("Selected structural model does not exist or exceeds its limit.")
    model = models[options.model_index].copy()
    available = {chain.id for chain in model}
    selected = set(options.chains) if options.chains else available
    if not selected or not selected <= available or len(selected) > 16:
        raise ValueError("Selected author chains do not belong to this exact structural model.")
    for chain in list(model):
        if chain.id not in selected:
            model.detach_child(chain.id)
    return model, {
        "model_count": len(models),
        "selected_chains": sorted(selected),
        "parser_warnings": [str(w.message)[:300] for w in warnings_found[:20]],
        "parser_warnings_truncated": len(warnings_found) > 20,
    }


def select_atoms(model, options):
    from Bio.PDB.Polypeptide import is_aa

    removed, resolved = [], []
    source_atom_count = 0
    for chain in list(model):
        for residue in list(chain):
            source_atom_count += len(residue.get_unpacked_list())
            if source_atom_count > 100000:
                raise ValueError("Preparation exceeds 100000 input atoms.")
            address = {
                "chain": chain.id,
                "number": residue.id[1],
                "insertion_code": residue.id[2].strip(),
                "resname": residue.resname,
            }
            if residue.is_disordered() == 2:
                raise ValueError(
                    "Alternate residue identities require a separately resolved source structure."
                )
            water = residue.id[0] == "W" or residue.resname in {"HOH", "WAT", "DOD"}
            heterogen = residue.id[0].startswith("H_") and not is_aa(residue, standard=False)
            if (water and not options.waters) or (heterogen and options.heterogens == "remove"):
                removed.append({**address, "reason": "water" if water else "heterogen"})
                chain.detach_child(residue.id)
                continue
            for atom in list(residue):
                if atom.is_disordered():
                    if options.alternate == "reject" or options.alternate not in atom.child_dict:
                        raise ValueError(
                            "Select an alternate atom location present at every ambiguous site."
                        )
                    selected = atom.child_dict[options.alternate].copy()
                    resolved.append({**address, "atom": atom.id, "alternate": options.alternate})
                    residue.detach_child(atom.id)
                    selected.disordered_flag = 0
                    selected.set_altloc(" ")
                    residue.add(selected)
                elif atom.get_altloc().strip():
                    if options.alternate != atom.get_altloc().strip():
                        raise ValueError(
                            "Selected alternate location differs from the source atom."
                        )
                    resolved.append({**address, "atom": atom.id, "alternate": options.alternate})
                    atom.set_altloc(" ")
                    atom.disordered_flag = 0
        if not len(chain):
            model.detach_child(chain.id)
    atoms = list(model.get_atoms())
    if not 3 <= len(atoms) <= 100000:
        raise ValueError("Prepared structure needs 3 to 100000 observed atoms.")
    if not all(math.isfinite(float(c)) for atom in atoms for c in atom.coord):
        raise ValueError("Structure contains nonfinite coordinates.")
    return atoms, removed, resolved
