"""NumPy-authored native-format contract fixture; no inferred research result.

Array layouts follow Boltz2.2.1 types.py. Includes a masked chain, modified
polymer, atom-tokenized ligand, ion and nucleic acid to exercise real identity
boundaries. Never install this fixture as an application example.
"""

import hashlib
import io
import json

import numpy as np

from opendde_workbench.integrations.contract import IntegratedTask
from opendde_workbench.models import Status
from opendde_workbench.prediction_sample_export import BOLTZ_OUTPUT
from opendde_workbench.store import Store

ATOMS = [
    ("name", "U4"),
    ("coords", "f4", (3,)),
    ("is_present", "?"),
    ("bfactor", "f4"),
    ("plddt", "f4"),
]
RESIDUES = [
    ("name", "U5"),
    ("res_type", "i1"),
    ("res_idx", "i4"),
    ("atom_idx", "i4"),
    ("atom_num", "i4"),
    ("atom_center", "i4"),
    ("atom_disto", "i4"),
    ("is_standard", "?"),
    ("is_present", "?"),
]
CHAINS = [
    ("name", "U5"),
    ("mol_type", "i1"),
    ("entity_id", "i4"),
    ("sym_id", "i4"),
    ("asym_id", "i4"),
    ("atom_idx", "i4"),
    ("atom_num", "i4"),
    ("res_idx", "i4"),
    ("res_num", "i4"),
    ("cyclic_period", "i4"),
]
IDENTITIES = [
    ["ZA", "ALA", 43, "N"],
    ["ZA", "ALA", 43, "CA"],
    ["ZA", "MSE", 45, "SE"],
    ["L", "LIG1", 1, "C1"],
    ["L", "LIG1", 1, "N1"],
    ["I", "ZN", 1, "ZN"],
    ["R", "A", 8, "P"],
    ["R", "A", 8, "O3'"],
]
LINKS = [0, 0, 1, 2, 3, 4, 5, 5]
SCORES = np.array([0.92, 0.83, 0.74, 0.65, 0.56, 0.47], dtype=np.float32)


def compressed(**values):
    stream = io.BytesIO()
    np.savez_compressed(stream, **values)
    return stream.getvalue()


def processed_structure():
    atoms = np.zeros(9, dtype=ATOMS)
    atoms["name"] = ["CA", "N", "CA", "SE", "C1", "N1", "ZN", "P", "O3'"]
    residues = np.array(
        [
            ("GLY", 0, 0, 0, 1, 0, 0, True, False),
            ("ALA", 0, 42, 1, 2, 1, 1, True, False),
            ("MSE", 0, 44, 3, 1, 3, 3, False, False),
            ("LIG1", 0, 0, 4, 2, 4, 4, False, False),
            ("ZN", 0, 0, 6, 1, 6, 6, True, False),
            ("A", 0, 7, 7, 2, 7, 7, True, False),
        ],
        dtype=RESIDUES,
    )
    chains = np.array(
        [
            ("D", 0, 0, 0, 0, 0, 1, 0, 1, 0),
            ("ZA", 0, 1, 0, 1, 1, 3, 1, 2, 0),
            ("L", 3, 2, 0, 2, 4, 2, 3, 1, 0),
            ("I", 3, 3, 0, 3, 6, 1, 4, 1, 0),
            ("R", 2, 4, 0, 4, 7, 2, 5, 1, 0),
        ],
        dtype=CHAINS,
    )
    return {
        "atoms": atoms,
        "residues": residues,
        "chains": chains,
        "mask": np.array([False, True, True, True, True]),
        "pocket": np.array(None, dtype=object),
    }


def structure_cif():
    fields = (
        "group_PDB id type_symbol label_atom_id label_alt_id label_comp_id label_seq_id "
        "auth_seq_id pdbx_PDB_ins_code label_asym_id Cartn_x Cartn_y Cartn_z occupancy "
        "label_entity_id auth_asym_id auth_comp_id B_iso_or_equiv pdbx_PDB_model_num"
    ).split()
    rows = ["data_boltz_contract_fixture", "loop_", *("_atom_site." + field for field in fields)]
    for i, (chain, resn, resi, atom) in enumerate(IDENTITIES):
        het = chain in {"L", "I"}
        element = "SE" if atom == "SE" else "ZN" if atom == "ZN" else atom[0]
        rows.append(
            f'{"HETATM" if het else "ATOM"} {i + 1} {element} "{atom}" . '
            f"{resn} {resi} {resi} ? {chain} {i * 1.4:.5f} {i % 2:.5f} 0.00000 "
            f"1 1 {chain} {resn} {float(SCORES[LINKS[i]]) * 100:.3f} 1"
        )
    return ("\n".join(rows) + "\n#\n").encode()


def case_files(root, request_sha256, *, declared):
    output = root / "output"
    native = output / BOLTZ_OUTPUT
    native.mkdir(parents=True)
    matrix = np.arange(36, dtype=np.float32).reshape(6, 6) / 2
    sources = {
        "pae": compressed(pae=matrix),
        "pde": compressed(pde=matrix.T.copy()),
        "plddt": compressed(plddt=SCORES),
        "mapping": compressed(**processed_structure()),
    }
    (output / "structure-001.cif").write_bytes(structure_cif())
    (native / "prediction_model_0.cif").write_bytes(structure_cif())
    for field, data in sources.items():
        target = (
            (output / "native/boltz_results_prediction/processed/structures/prediction.npz")
            if field == "mapping"
            else native / f"{field}_prediction_model_0.npz"
        )
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    files = {"structure-001.cif": hashlib.sha256(structure_cif()).hexdigest()}
    sample = {
        "candidate_id": "structure-001",
        "native_rank": 0,
        "structure_artifact": "structure-001.cif",
    }
    if declared:
        for field, data in sources.items():
            name = (
                "boltz-processed-structure.npz"
                if field == "mapping"
                else f"structure-001-{field}.npz"
            )
            (output / name).write_bytes(data)
            files[name] = hashlib.sha256(data).hexdigest()
            if field != "mapping":
                sample[field + "_artifact"] = name
    result = {
        "operation": "boltz_predict",
        "program": "boltz",
        "version": "2.2.1",
        "request_sha256": request_sha256,
        "candidates": [
            {
                "id": "structure-001",
                "artifact": "structure-001.cif",
                "geometry": "predicted_structure",
                "metrics": [],
            }
        ],
        "artifact_sha256": files,
    }
    if declared:
        result["boltz"] = {
            "protocol": "boltz-2.2.1-cif-row-v1",
            "writer_version": "2.2.1",
            "mapping_artifact": "boltz-processed-structure.npz",
            "samples": [sample],
        }
    (output / "result.json").write_text(json.dumps(result))
    return result, sources


def native_case(state, *, declared):
    request = IntegratedTask.model_validate(
        {
            "name": "Native confidence contract fixture — not a research example",
            "operation": "boltz_predict",
            "payload": {
                "kind": "boltz",
                "samples": 1,
                "components": [
                    {
                        "id": "A",
                        "kind": "protein",
                        "value": "ACDEFGHIKLMNPQRSTVWY",
                        "msa_mode": "single",
                    }
                ],
            },
            "options": {"device": "cuda"},
        }
    )
    store = Store(state / "jobs.sqlite3")
    job = store.create(request, "native-confidence-fixture", 5, 20)
    assert store.claim(job.id)
    store.finish(job.id, Status.SUCCEEDED)
    with store.connect() as db:
        authored = db.execute("SELECT request FROM jobs WHERE id=?", (job.id,)).fetchone()[0]
    digest = hashlib.sha256(authored.encode()).hexdigest()
    root = state / "jobs" / job.id
    result, sources = case_files(root, digest, declared=declared)
    return store, store.get(job.id), result, sources, digest
