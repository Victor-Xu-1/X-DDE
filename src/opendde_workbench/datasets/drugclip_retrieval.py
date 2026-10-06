"""Pocket encoding once, exact reusable-index search and genuine unbound candidates."""

import bisect
import json
import random
from pathlib import Path

import h5py
import numpy as np
from drugclip_encoder import dictionaries, encode, fingerprint, model_for
from drugclip_pocket import pocket
from platformnative_io import finish, progress, readonly_database, source_result, write_csv
from retrieval_topk import TopK, calibration, fold_scores


def sources(request, identity):
    values = []
    for position in range(len(request["sources"])):
        root, result = source_result(request, position)
        metadata = result["metadata"]
        if (
            metadata.get("fingerprint") != identity
            or metadata.get("dimension") != 768
            or metadata.get("precision") != request["payload"]["precision"]
        ):
            raise ValueError(
                "Choose indexes built with the same exact model, vocabulary and precision."
            )
        shards = sorted(
            row["name"] for row in result["artifacts"] if row["role"] == "molecule_embeddings"
        )
        count = 0
        entries = []
        for name in shards:
            with h5py.File(root / name, "r") as file:
                rows = file["vectors"].shape[0]
                if file["vectors"].shape != (rows, 768) or not file.attrs["folds_complete"].all():
                    raise ValueError("A reusable index contains an unfinished model fold.")
                entries.append((name, count, rows))
                count += rows
        if count != result["counts"]["indexed"] or not count:
            raise ValueError("Index row identities do not match their scientific manifest.")
        values.append((root, result, entries, count))
    return values


def reference_scores(indexes, query, options, seed):
    total = sum(item[3] for item in indexes)
    chosen = sorted(
        random.Random(seed).sample(range(total), min(options["calibration_rows"], total))
    )
    scores, cursor = [], 0
    for root, _, entries, count in indexes:
        for name, offset, rows in entries:
            left, right = (
                bisect.bisect_left(chosen, cursor + offset),
                bisect.bisect_left(chosen, cursor + offset + rows),
            )
            local = np.array(
                [position - cursor - offset for position in chosen[left:right]], dtype=np.int64
            )
            if len(local):
                with h5py.File(root / name, "r") as file:
                    scores.append(fold_scores(file["vectors"][local], query))
        cursor += count
    return np.concatenate(scores, axis=0)


def retain_candidates(request, indexes, ranked):
    from rdkit import Chem

    databases = [readonly_database(item[0] / "index-members.sqlite") for item in indexes]
    seen, rows, candidates, failures = set(), [], [], []
    writer = Chem.SDWriter("/output/candidates.sdf")
    written = 0
    try:
        for score, raw_score, index, ordinal in ranked:
            row = (
                databases[index]
                .execute("SELECT * FROM members WHERE ordinal=?", (ordinal,))
                .fetchone()
            )
            if row is None:
                raise ValueError("A ranked embedding has no confirmed chemical identity.")
            if row["id"] in seen:
                continue
            seen.add(row["id"])
            if len(rows) == request["payload"]["top_k"]:
                break
            rows.append(
                [
                    len(rows) + 1,
                    row["id"],
                    score,
                    raw_score,
                    row["smiles"],
                    row["supplier"],
                    row["source_job"],
                    row["source_record"],
                ]
            )
            candidate = {
                "id": row["id"],
                "source_job": row["source_job"],
                "source_record": row["source_record"],
                "supplier": row["supplier"],
                "smiles": row["smiles"],
                "score": score,
                "raw_score": raw_score,
                "geometry": "none",
            }
            if len(candidates) < request["payload"]["retain"]:
                molecule = Chem.MolFromMolBlock(row["molblock"], removeHs=False)
                if (
                    molecule is None
                    or not molecule.GetNumConformers()
                    or not molecule.GetConformer().Is3D()
                ):
                    failures.append([row["id"], "indexed_conformer_unavailable"])
                else:
                    molecule.SetProp("_Name", row["id"])
                    molecule.SetProp("XDDE_COMPOUND_ID", row["id"])
                    molecule.SetProp("XDDE_GEOMETRY", "unbound_conformer")
                    molecule.SetDoubleProp("DRUGCLIP_SCORE", score)
                    writer.write(molecule)
                    candidate.update(
                        artifact="candidates.sdf",
                        record=written,
                        geometry="unbound_conformer",
                    )
                    written += 1
            candidates.append(candidate)
    finally:
        writer.close()
        for database in databases:
            database.close()
    write_csv(
        "/output/ranked-candidates.csv",
        [
            "rank",
            "compound",
            "retrieval_score",
            "mean_cosine",
            "smiles",
            "supplier",
            "source_job",
            "source_record",
        ],
        rows,
    )
    write_csv("/output/candidate-failures.csv", ["compound", "reason"], failures)
    return candidates, failures


def run(request):
    import torch

    options, execution = request["payload"], request["options"]
    if options["use"] != "non_commercial":
        raise ValueError("The selected official weights require noncommercial research use.")
    device = execution["device"]
    if device == "cuda" and not torch.cuda.is_available():
        raise ValueError("The selected pocket-encoding GPU is unavailable.")
    torch.set_num_threads(execution["cpu"])
    identity, _ = fingerprint()
    indexes = sources(request, identity)
    example, vocab, query = pocket(request), dictionaries(), []
    for fold in range(6):
        model = model_for(fold, device, options["precision"], vocab)
        query.append(encode(model, [example], vocab["pocket"], "pocket", device)[0])
        del model
        if device == "cuda":
            torch.cuda.empty_cache()
        progress("Encoding the selected pocket", fold + 1, 6)
    query = np.asarray(query)
    mean, deviation = (
        calibration(reference_scores(indexes, query, options, execution["seed"]))
        if options["score"] == "fold_zscore"
        else (np.zeros(6), np.ones(6))
    )
    top = TopK(options["top_k"] * len(indexes))
    completed, total = 0, sum(item[3] for item in indexes)
    for number, (root, _, entries, _) in enumerate(indexes):
        for name, offset, rows in entries:
            with h5py.File(root / name, "r") as file:
                for start in range(0, rows, options["block_rows"]):
                    stop = min(start + options["block_rows"], rows)
                    values = fold_scores(file["vectors"][start:stop], query)
                    top.add(
                        ((values - mean) / deviation).mean(axis=1),
                        values.mean(axis=1),
                        number,
                        offset + start,
                    )
                    completed += stop - start
                    progress("Searching indexed compounds", completed, total)
    candidates, failures = retain_candidates(request, indexes, top.rows())
    artifacts = {
        "ranked-candidates.csv": "candidate_ranking",
        "candidate-failures.csv": "rejected_records",
        "pocket.json": "observed_pocket",
    }
    molecular = [row for row in candidates if row.get("artifact")]
    if molecular:
        artifacts["candidates.sdf"] = "unbound_candidates"
    else:
        Path("/output/candidates.sdf").unlink()
    Path("/output/ranking-method.json").write_text(
        json.dumps(
            {
                "method": options["score"],
                "fold_mean": mean.tolist(),
                "fold_std": deviation.tolist(),
                "calibration_rows": min(options["calibration_rows"], total),
                "seed": execution["seed"],
                "population": "indexed_rows_before_cross_library_chemical_deduplication",
                "fingerprint": identity,
                "query": query.tolist(),
                "sources": request["sources"],
            }
        )
    )
    artifacts["ranking-method.json"] = "retrieval_method"
    finish(
        request,
        "6-fold@9d0db739",
        "screening",
        artifacts,
        counts={
            "searched_rows": total,
            "returned": len(candidates),
            "retained_3d": len(molecular),
            "failed": len(failures),
        },
        candidates=candidates,
        molecule_artifact="candidates.sdf" if molecular else None,
        metadata={
            "score_method": options["score"],
            "use": "non_commercial",
            "geometry": "unbound; no receptor docking has been run",
            "fingerprint": identity,
        },
    )
