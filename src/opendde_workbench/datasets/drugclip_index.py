"""Create reusable molecule shards once, then encode six official folds with bounded memory."""

import json
import sqlite3
from pathlib import Path

import h5py
import numpy as np
from drugclip_encoder import dictionaries, encode, fingerprint, model_for
from library_database import members
from library_records import unbound_conformer
from platformnative_io import finish, progress, readonly_database, source_result, write_csv


def new_shard(number):
    file = h5py.File(f"/output/embeddings-{number:05d}.h5", "w")
    file.create_dataset(
        "vectors",
        shape=(0, 768),
        maxshape=(None, 768),
        dtype="float32",
        chunks=(64, 768),
        fillvalue=np.nan,
    )
    file.create_dataset("numbers", shape=(0,), maxshape=(None,), dtype="int16", chunks=True)
    file.create_dataset(
        "coordinates", shape=(0, 3), maxshape=(None, 3), dtype="float32", chunks=True
    )
    file.create_dataset("offsets", data=[0], maxshape=(None,), dtype="int64", chunks=True)
    file.attrs["folds_complete"] = np.zeros(6, dtype=bool)
    return file


def stage_members(request):
    from rdkit import Chem

    root, source = source_result(request)
    source_db = readonly_database(root / "library.sqlite")
    output = sqlite3.connect("/output/index-members.sqlite")
    output.execute("PRAGMA cache_size=-16384")
    output.executescript("""
        CREATE TABLE members (ordinal INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE,
          source_record INTEGER NOT NULL, source_job TEXT NOT NULL, supplier TEXT NOT NULL,
          smiles TEXT NOT NULL, molblock TEXT NOT NULL, display_name TEXT NOT NULL,
          shard INTEGER NOT NULL, row INTEGER NOT NULL);
        CREATE INDEX member_order ON members(shard,row);
        CREATE TABLE rejected (id TEXT PRIMARY KEY,
          source_record INTEGER NOT NULL, reason TEXT NOT NULL);
    """)
    shard, shard_number, encoded, rejected = new_shard(0), 0, 0, 0
    options, vocab = request["payload"], dictionaries()["mol"]
    try:
        for attempted, row in enumerate(members(source_db), start=1):
            if attempted > options["max_records"]:
                raise ValueError("The library exceeds the explicit molecule-encoding budget.")
            try:
                molecule = Chem.MolFromMolBlock(row["molblock"], removeHs=False)
                if molecule is None or not 1 <= molecule.GetNumHeavyAtoms() <= 510:
                    raise ValueError("native_encoder_atom_budget")
                if not row["is_3d"]:
                    molecule = unbound_conformer(
                        molecule, request["options"]["seed"] + row["source_record"] % 100000
                    )
                atoms = [atom for atom in molecule.GetAtoms() if atom.GetAtomicNum() > 1]
                if any(vocab.index(atom.GetSymbol()) == vocab.unk() for atom in atoms):
                    raise ValueError("element_outside_official_vocabulary")
                coordinates = molecule.GetConformer().GetPositions()[
                    [atom.GetIdx() for atom in atoms]
                ]
                if not np.isfinite(coordinates).all():
                    raise ValueError("nonfinite_conformer_coordinates")
            except (ValueError, RuntimeError) as exc:
                output.execute(
                    "INSERT INTO rejected VALUES (?,?,?)",
                    (row["id"], row["source_record"], str(exc)[:240]),
                )
                rejected += 1
                continue
            if shard["vectors"].shape[0] == options["shard_rows"]:
                shard.close()
                shard_number += 1
                shard = new_shard(shard_number)
            local_row = shard["vectors"].shape[0]
            shard["vectors"].resize((local_row + 1, 768))
            start = int(shard["offsets"][-1])
            stop = start + len(atoms)
            shard["numbers"].resize((stop,))
            shard["coordinates"].resize((stop, 3))
            shard["numbers"][start:stop] = [atom.GetAtomicNum() for atom in atoms]
            shard["coordinates"][start:stop] = coordinates
            shard["offsets"].resize((local_row + 2,))
            shard["offsets"][local_row + 1] = stop
            output.execute(
                "INSERT INTO members VALUES (?,?,?,?,?,?,?,?,?,?)",
                (
                    encoded,
                    row["id"],
                    row["source_record"],
                    request["sources"][0]["job_id"],
                    row["supplier"],
                    row["smiles"],
                    Chem.MolToMolBlock(molecule),
                    source_db.execute(
                        "SELECT supplier_id FROM records WHERE record=?", (row["source_record"],)
                    ).fetchone()[0],
                    shard_number,
                    local_row,
                ),
            )
            encoded += 1
            if attempted % 1000 == 0:
                output.commit()
                shard.flush()
                progress(
                    "Preparing encoding conformers", attempted, source["counts"]["unique_compounds"]
                )
        if not encoded:
            raise ValueError(
                "No molecules could be encoded with the selected official DrugCLIP model."
            )
        output.commit()
        write_csv(
            "/output/encoding-rejections.csv",
            ["compound", "source_record", "reason"],
            output.execute("SELECT * FROM rejected ORDER BY source_record"),
        )
    finally:
        shard.close()
        output.close()
        source_db.close()
    return encoded, rejected, shard_number + 1


def shard_examples(shard, start, stop):
    from rdkit import Chem

    offsets = shard["offsets"][start : stop + 1]
    beginning, end = int(offsets[0]), int(offsets[-1])
    coordinates, numbers = shard["coordinates"][beginning:end], shard["numbers"][beginning:end]
    table = Chem.GetPeriodicTable()
    return [
        (
            [
                table.GetElementSymbol(int(number))
                for number in numbers[left - beginning : right - beginning]
            ],
            coordinates[left - beginning : right - beginning],
        )
        for left, right in zip(offsets[:-1], offsets[1:], strict=True)
    ]


def run(request):
    import torch

    options, execution = request["payload"], request["options"]
    device = execution["device"]
    if device == "cuda" and not torch.cuda.is_available():
        raise ValueError("The selected encoding server GPU is unavailable.")
    torch.set_num_threads(execution["cpu"])
    identity, body = fingerprint()
    count, rejected, shards = stage_members(request)
    vocab = dictionaries()
    for fold in range(6):
        model = model_for(fold, device, options["precision"], vocab)
        completed = 0
        for number in range(shards):
            with h5py.File(f"/output/embeddings-{number:05d}.h5", "r+") as file:
                for start in range(0, file["vectors"].shape[0], options["batch_size"]):
                    stop = min(start + options["batch_size"], file["vectors"].shape[0])
                    file["vectors"][start:stop, fold * 128 : (fold + 1) * 128] = encode(
                        model, shard_examples(file, start, stop), vocab["mol"], "mol", device
                    )
                    completed += stop - start
                    progress(f"Encoding molecules · fold {fold + 1}/6", completed, count)
                mask = file.attrs["folds_complete"]
                mask[fold] = True
                file.attrs["folds_complete"] = mask
                file.flush()
        del model
        if device == "cuda":
            torch.cuda.empty_cache()
    Path("/output/encoding-policy.json").write_text(json.dumps(body, indent=2))
    finish(
        request,
        "6-fold@9d0db739",
        "index",
        {
            "index-members.sqlite": "embedding_row_identities",
            "encoding-rejections.csv": "rejected_records",
            "encoding-policy.json": "encoding_method",
            **{f"embeddings-{number:05d}.h5": "molecule_embeddings" for number in range(shards)},
        },
        counts={"indexed": count, "rejected": rejected, "shards": shards},
        metadata={
            "fingerprint": identity,
            "dimension": 768,
            "folds": 6,
            "library": request["sources"][0],
            "precision": options["precision"],
            "use": "non_commercial",
            "geometry": "unbound_conformers",
        },
    )
