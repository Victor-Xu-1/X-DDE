"""Write derived selected coordinates with exact deposited modified-residue identity."""

import hashlib


def verify_export(model, path):
    import math

    from native_io import read_model
    from selection import MemberSelection

    restored, _ = read_model(path, MemberSelection(chains=tuple(chain.id for chain in model)))

    def atoms(value):
        return {
            (chain.id, res.id[1], res.id[2].strip(), res.resname, atom.id, atom.element): tuple(
                map(float, atom.coord)
            )
            for chain in value
            for res in chain
            for atom in res
        }

    expected, actual = atoms(model), atoms(restored)
    if expected.keys() != actual.keys() or any(
        math.dist(point, actual[key]) > 0.001 for key, point in expected.items()
    ):
        raise ValueError(
            "Derived structural export changed source identities or aligned coordinates."
        )


def write_compared_model(model, modifications, path):
    from Bio.PDB import MMCIFIO
    from Bio.PDB.MMCIF2Dict import MMCIF2Dict

    writer = MMCIFIO()
    writer.set_structure(model)
    writer.save(str(path))
    if modifications:
        data = MMCIF2Dict(str(path))
        prefix = "_pdbx_struct_mod_residue."
        data.update(
            {
                prefix + "id": [str(i + 1) for i in range(len(modifications))],
                prefix + "auth_asym_id": [row["chain"] for row in modifications],
                prefix + "auth_seq_id": [str(row["number"]) for row in modifications],
                prefix + "PDB_ins_code": [row["insertion_code"] or "?" for row in modifications],
                prefix + "auth_comp_id": [row["residue"] for row in modifications],
                prefix + "parent_comp_id": [row["parent"] for row in modifications],
            }
        )
        writer = MMCIFIO()
        writer.set_dict(data)
        writer.save(str(path))
    if not path.is_file() or not 1 <= path.stat().st_size <= 25 * 1024**2:
        raise ValueError("Derived comparison structure exceeds its bounded output contract.")
    verify_export(model, path)
    return hashlib.sha256(path.read_bytes()).hexdigest()
