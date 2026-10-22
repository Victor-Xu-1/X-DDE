"""Curate construct inputs only from verified, reviewed native study results."""

import hashlib
import json
from uuid import UUID, uuid5

from ...alignment_files import read_alignment
from ...alignment_slice import a3m_bytes, slice_columns
from ...artifacts import contained
from ...research.contracts import VersionInput
from ..pins import ExamplePins
from .catalogue import FILES

NAMESPACE = UUID("f8c6f628-85cf-47ed-85c6-ec23706209d9")


def _result(scientific, records, capability):
    pin = ExamplePins(scientific.store, records.settings.state_dir, modules=records.modules).get(
        capability, verify=True
    )
    if pin is None or pin.review is None:
        return None
    job = scientific.store.get(str(pin.job_id))
    output = records.settings.state_dir / "jobs" / str(pin.job_id) / "output"
    result = json.loads(contained(output, "result.json").read_text(encoding="utf-8"))
    documents = result.get("documents", [])
    if len(documents) != 1:
        raise ValueError("Reviewed preparation requires one complete native input document.")
    path = contained(output, documents[0])
    if path.stat().st_size > 2 * 1024**2:
        raise ValueError("Reviewed native input document exceeds its managed limit.")
    document = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(document, list) or len(document) != 1:
        raise ValueError("Reviewed preparation requires one native molecular system.")
    proteins = [
        entry["proteinChain"] for entry in document[0]["sequences"] if "proteinChain" in entry
    ]
    if len(proteins) != 1 or proteins[0].get("count", 1) != 1:
        raise ValueError("Reviewed preparation requires one unambiguous protein construct.")
    return pin, job, output, proteins[0]


def reviewed_prediction_inputs(scientific, records, canonical):
    """Return explicit edited inputs, never mislabel them as raw native outputs."""
    if records is None:
        return None
    imported = _result(scientific, records, "import")
    features = _result(scientific, records, "features")
    if imported is None or features is None:
        return None
    import_pin, import_job, _, construct = imported
    feature_pin, feature_job, output, protein = features
    if import_job.request.operation != "json" or feature_job.request.operation not in {
        "msa",
        "mt",
        "prep",
    }:
        raise ValueError("Construct and alignment sources must be reviewed native preparations.")
    if (
        len(import_job.request.assets) != 1
        or scientific.assets.get(import_job.request.assets[0]).sha256
        != FILES["stat6_structure"].sha256
    ):
        raise ValueError("The declared construct does not come from the reviewed STAT6 structure.")
    sequence = construct["sequence"]
    start = canonical.find(sequence)
    if (
        not sequence
        or start < 0
        or canonical.find(sequence, start + 1) >= 0
        or protein["sequence"] != canonical
    ):
        raise ValueError("The declared construct must match one exact canonical sequence interval.")
    stop = start + len(sequence)
    native_path = protein.get("unpairedMsaPath", "")
    if not native_path.startswith("/job/output/"):
        raise ValueError("The reviewed MSA must belong to its native task output.")
    path = contained(output, native_path.removeprefix("/job/output/"))
    rows = read_alignment(path, canonical)
    selected, excluded = slice_columns(rows, canonical, start, stop)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    origin = {
        "alignment_job": str(feature_pin.job_id),
        "alignment_artifact": path.relative_to(output).as_posix(),
        "alignment_sha256": digest,
        "construct_job": str(import_pin.job_id),
        "canonical_range_inclusive": [start + 1, stop],
        "source_rows": len(rows),
        "retained_rows": len(selected),
        "excluded_all_gap_rows": excluded,
        "method": (
            "Select aligned columns and preceding insertions; "
            "preserve headers and order; no search or inference."
        ),
    }

    def register(
        name, kind, data, label, *, parent=None, source=None, validation="file_integrity_only"
    ):
        asset = scientific.assets.save(name, kind, data)
        notes = json.dumps(
            {key: value for key, value in origin.items() if key != "excluded_all_gap_rows"},
            sort_keys=True,
        )
        return scientific.create(
            VersionInput(
                asset_id=asset.id,
                kind="alignment" if kind == "msa" else "sequence",
                label=label,
                parent_id=parent,
                relation="prepared_from",
                notes=notes,
            ),
            uuid5(
                NAMESPACE,
                name + ":" + asset.sha256 + ":" + str(source) + ":" + str(parent) + ":" + notes,
            ),
            source_job=source,
            validation=validation,
        )

    source_msa = register(
        path.name,
        "msa",
        path.read_bytes(),
        "STAT6 · Native full-length MSA",
        source=feature_pin.job_id,
        validation="native_generated",
    )
    basename = f"STAT6-9BIG-{start + 1}-{stop}"
    msa = register(
        basename + "-derived-native-MSA.a3m",
        "msa",
        a3m_bytes(selected),
        "STAT6 · Declared-construct alignment",
        parent=source_msa.id,
        source=feature_pin.job_id,
    )
    fasta = f">STAT6|P42226|9BIG_declared_construct|{start + 1}-{stop}\n{sequence}\n".encode()
    construct_object = register(
        basename + "-declared-construct.fasta",
        "sequences",
        fasta,
        "STAT6 · Declared experimental construct",
        source=import_pin.job_id,
    )
    return {
        "sequence": sequence,
        "objects": {
            "prediction_construct": construct_object,
            "prediction_msa": msa,
            "prediction_msa_parent": source_msa,
        },
        "provenance": origin,
    }
