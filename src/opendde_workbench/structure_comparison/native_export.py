"""Write derived selected coordinates with exact deposited modified-residue identity."""

import hashlib


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
    return hashlib.sha256(path.read_bytes()).hexdigest()
