"""One bounded native comparison; no independent queue, assets, database or network."""

from importlib.metadata import version

from comparison_geometry import compare_frame
from comparison_matching import mapped_pairs
from comparison_options import ComparisonOptions
from comparison_polymer import selected_polymer
from comparison_quality import score_interfaces
from comparison_reports import write_reports
from native_io import input_file, read_model
from profiles import profile
from selection import MemberSelection


def read_input(file, model_index, mappings, side):
    selection = MemberSelection(
        model_index=model_index, chains=tuple(getattr(pair, side) for pair in mappings)
    )
    original, details = read_model(file, selection)
    model, codes, polymer = selected_polymer(file, original)
    chains, quality = profile(model, parent_codes=codes)
    if set(chains) != set(selection.chains):
        raise ValueError("Every mapped role must be represented by observed protein C-alpha atoms.")
    return model, chains, codes, {"source": details, "polymer": polymer, "quality": quality}


def run_comparison(request, bindings, directory, output):
    options = ComparisonOptions.model_validate(request["options"])
    mappings = (*options.target_mapping, *options.partner_mapping)
    sources = [input_file(request[role], bindings, directory) for role in ("reference", "moving")]
    reference, fixed_chains, fixed_codes, reference_inspection = read_input(
        sources[0], options.reference_model, mappings, "reference"
    )
    moving, mobile_chains, mobile_codes, moving_inspection = read_input(
        sources[1], options.moving_model, mappings, "moving"
    )
    target_pairs, target_mapping = mapped_pairs(
        fixed_chains, mobile_chains, options.target_mapping, options, "target"
    )
    partner_pairs, partner_mapping = mapped_pairs(
        fixed_chains, mobile_chains, options.partner_mapping, options, "partner"
    )
    identities = [request[role]["sha256"] for role in ("reference", "moving")]
    quality = score_interfaces(
        reference,
        moving,
        (fixed_codes, mobile_codes),
        options,
        identities,
    )
    geometry = compare_frame(moving, target_pairs, partner_pairs)
    inspections = [reference_inspection, moving_inspection]
    artifacts = write_reports(output, sources, [reference, moving], inspections, geometry, quality)
    return {
        "operation": "structure_compare",
        "complete": True,
        "schema_version": 1,
        "reference": request["reference"],
        "moving": request["moving"],
        "options": options.model_dump(mode="json"),
        "inspections": inspections,
        "chain_correspondence": target_mapping + partner_mapping,
        "geometry": geometry,
        "native_quality": quality,
        "artifact_sha256": artifacts,
        "coordinate_frame": "selected_reference_source",
        "export_rounding_tolerance_angstrom": 0.001,
        "versions": {
            "biopython": version("biopython"),
            "numpy": version("numpy"),
            "dockq": version("dockq"),
        },
        "scope": "observed_reference_conditioned_structural_comparison_not_affinity",
        "unobserved_coordinates": "not_generated",
    }
