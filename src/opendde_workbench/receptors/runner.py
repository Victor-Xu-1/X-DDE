"""One-shot native receptor alignment; no queue, platform database or network calls."""

import json
from pathlib import Path

from correspondence import correspond
from native_fit import fit
from native_io import input_file, read_model, write_model
from profiles import profile
from selection import EnsembleOptions, MemberSelection


def inspect(file, selected):
    model, details = read_model(file, selected)
    chains, quality = profile(model)
    return model, chains, {**details, **quality, "source_profile": selected.profile}


def require_backbone(quality, options):
    if options.require_complete_backbone and not quality["backbone_complete"]:
        raise ValueError(
            "The selected model has incomplete N/C/O backbone atoms; "
            "prepare it first or explicitly choose geometry-only comparison."
        )


def run(request, bindings, directory, output):
    import numpy as np
    from Bio import __version__ as bio_version

    if request["operation"] == "structure_prepare":
        from native_preparation import run_preparation

        return run_preparation(request, bindings, directory, output)
    if request["operation"] != "receptor_ensemble":
        raise ValueError("This native adapter only aligns receptor ensembles.")
    options = EnsembleOptions.model_validate(request["options"])
    inputs = request["inputs"]
    if (
        not isinstance(inputs, list)
        or not 2 <= len(inputs) <= 16
        or options.reference_index >= len(inputs)
    ):
        raise ValueError("Choose two to sixteen inputs and a reference belonging to them.")
    selections = [MemberSelection.model_validate(item["selection"]) for item in inputs]
    # Snapshot/digest failures invalidate the task instead of becoming acceptable partial inputs.
    paths = [input_file(item["structure"], bindings, directory) for item in inputs]
    reference_index = options.reference_index
    reference, reference_chains, reference_quality = inspect(
        paths[reference_index], selections[reference_index]
    )
    require_backbone(reference_quality, options)
    rows = []
    for index, (item, file, selected) in enumerate(zip(inputs, paths, selections, strict=True)):
        row = {
            "index": index,
            "source": item,
            "status": "rejected",
            "artifact": None,
            "artifact_sha256": None,
            "correspondence": None,
            "transformation": None,
            "quality": None,
            "reason": None,
        }
        try:
            if index == reference_index:
                model = reference.copy()
                chains, quality = reference_chains, reference_quality
                pairs = [(value, value) for values in chains.values() for value in values]
                if len(pairs) < options.minimum_pairs:
                    raise ValueError("The reference has too few C-alpha anchors.")
                metadata = {
                    "method": "reference_coordinates",
                    "pair_count": len(pairs),
                    "identity": 1.0,
                    "coverage": 1.0,
                }
            else:
                model, chains, quality = inspect(file, selected)
                row["quality"] = quality
                require_backbone(quality, options)
                pairs, metadata = correspond(reference_chains, chains, selected, options)
            row["quality"] = quality
            transformation = fit(model, pairs, options)
            artifact = f"aligned-{index:03d}" + file.suffix
            checksum = write_model(model, output / artifact)
            row.update(
                status="reference" if index == reference_index else "aligned",
                correspondence=metadata,
                transformation=transformation,
                artifact=artifact,
                artifact_sha256=checksum,
            )
        except ValueError as error:
            if index == reference_index:
                raise ValueError("Reference frame is not usable: " + str(error)) from error
            row["reason"] = str(error)[:1000]
        rows.append(row)
    qualified = sum(row["status"] != "rejected" for row in rows)
    return {
        "operation": "receptor_ensemble",
        "complete": True,
        "schema_version": 1,
        "inputs": inputs,
        "options": options.model_dump(mode="json"),
        "members": rows,
        "qualified_count": qualified,
        "collection_status": "aligned" if qualified == len(inputs) else "partial",
        "coordinate_frame": "selected_reference_structure",
        "coordinate_unit": "angstrom",
        "export_rounding_tolerance_angstrom": 0.001,
        "versions": {"biopython": bio_version, "numpy": np.__version__},
        "method_scope": "observed_ca_rigid_superposition_not_conformation_sampling",
        "biological_assembly": "provided_coordinates_only",
        "chemical_validation": "not_full_atom_parameterization",
    }


def main():
    directory, output = Path("/input"), Path("/output")
    value = run(
        json.loads((directory / "request.json").read_text()),
        json.loads((directory / "bindings.json").read_text()),
        directory,
        output,
    )
    temporary = output / "result.json.tmp"
    temporary.write_text(
        json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False),
        encoding="utf-8",
    )
    temporary.replace(output / "result.json")


if __name__ == "__main__":
    main()
