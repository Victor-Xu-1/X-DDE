"""Confirmed public raw inputs and successful upstream stages; never manufacture data/results."""

import hashlib

from ...artifacts import contained
from ...datasets.bindings import resolve_source
from ...datasets.contract import DatasetTask, NativeSource
from .catalogue import CASE

DEPENDENCIES = {
    "enumerate": (("del.library", "definition"),),
    "decode": (("del.library", "definition"),),
    "count": (("del.decode", "decoded"),),
    "series": (("del.analyze", "analysis"),),
    "model": (("del.analyze", "analysis"),),
    "candidates": (("del.analyze", "analysis"),),
    "followup": (("del.analyze", "analysis"),),
}


def stage_source(capability, role, scientific, records, pins):
    pin = pins.get(capability, verify=True)
    if pin is None:
        return None
    if pin.review is None:
        raise ValueError("Review the actual DEL stage before using it in a fixed example.")
    file = contained(
        records.settings.state_dir / "jobs" / str(pin.job_id) / "output", "result.json"
    )
    reference = NativeSource(
        job_id=pin.job_id,
        role=role,
        report_sha256=hashlib.sha256(file.read_bytes()).hexdigest(),
    )
    resolve_source(scientific.store, records.settings.state_dir, reference, full_hash=True)
    return reference


def study_request(capability, assets, scientific, records, pins):
    mode = "validate" if capability == "del.library" else capability.removeprefix("del.")
    sources, missing = [], []
    for parent, role in DEPENDENCIES.get(mode, ()):
        reference = stage_source(parent, role, scientific, records, pins) if records else None
        if reference is None:
            missing.append(parent)
        else:
            sources.append(reference)
    if missing:
        return None, missing
    material = {
        "validate": ("definition", "del_definition"),
        "decode": ("reads", "del_reads"),
        "analyze": ("counts", "del_counts"),
        "followup": ("counts", "del_followup"),
    }.get(mode)
    inputs = []
    if material:
        role, key = material
        asset = assets[key]
        inputs.append(
            {
                "role": role,
                "label": "public-brd4-subset" if role == "reads" else asset.name,
                "source": {"asset_id": asset.id, "sha256": asset.sha256},
            }
        )
    payload = {
        "kind": "deli",
        "mode": mode,
        "library": "DEL006",
        "library_size": 884736,
        "max_members": 600000,
        "max_reads": 1000,
        "chosen_comparison": "BRD4_E2_vs_matrix",
    }
    if mode == "enumerate":
        payload["selected_members"] = [
            ["A035", "B040", "C030"],
            ["A035", "B040", "C029"],
            ["A035", "B041", "C030"],
            ["A034", "B040", "C030"],
        ]
    elif mode == "decode":
        payload.update(
            read_samples=[{"input_label": "public-brd4-subset", "sample": "BRD4_public_subset"}],
            library_errors=2,
            barcode_errors=1,
            reverse_complement=True,
        )
    elif mode == "count":
        payload["umi_method"] = "directional"
    elif mode == "analyze":
        samples, comparisons = [], []
        for eluate, targets, control in ((1, (2, 3, 4), 6), (2, (7, 8, 11), 13)):
            for replicate, index in enumerate((*targets, control), 1):
                samples.append(
                    {
                        "column": f"raw_index{index}",
                        "group": f"BRD4_E{eluate}" if index != control else f"Matrix_E{eluate}",
                        "role": "target" if index != control else "matrix",
                        "replicate": replicate if index != control else 1,
                        "round": 1,
                        "batch": f"eluate-{eluate}",
                    }
                )
            comparisons.append(
                {
                    "id": f"BRD4_E{eluate}_vs_matrix",
                    "selection": f"BRD4_E{eluate}",
                    "reference": f"Matrix_E{eluate}",
                }
            )
        payload.update(
            samples=samples,
            comparisons=comparisons,
            count_unit="reads",
            cycle_columns=["ID_A", "ID_B", "ID_C"],
        )
    elif mode == "series":
        payload["series_cycles"] = [1, 2]
    elif mode == "model":
        payload.update(holdout_cycle=0, max_training_members=5000, trees=200)
    elif mode == "candidates":
        payload.update(selected_ids=["A035-B040-C030"], attachment_policy="cap_hydrogen")
    elif mode == "followup":
        payload.update(
            followup_endpoint="reported_binding",
            followup_unit="qualitative",
            followup_value_column="reported_binding",
            followup_source=CASE.sources[0] + "/README.md",
        )
    task = DatasetTask(
        operation="del_" + mode,
        name=(CASE.label[1] + " · " + mode)[:80],
        inputs=inputs,
        sources=sources,
        scientific_inputs=[item["source"] for item in inputs],
        payload=payload,
        options={"device": "cpu", "cpu": 2, "memory_mib": 2048, "seed": 2026},
        time_limit_seconds=1800,
        output_bytes=1024**3,
    )
    return task.model_dump(mode="json"), []
