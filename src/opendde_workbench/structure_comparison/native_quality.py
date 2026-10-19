"""Pinned native DockQ metrics use explicit source-bound correspondence and original atoms."""

import math
from importlib.metadata import version

from comparison_matching import mapped_pairs
from comparison_quality_model import explicit_alignment, heavy_coordinates, quality_model


def selected_pairs(pairs, mapping):
    return [
        (left, right)
        for left, right in pairs
        if left[2]["chain"] == mapping.reference and right[2]["chain"] == mapping.moving
    ]


def score_interfaces(reference, moving, parent_codes, options, source_identities):
    if version("dockq") != "2.1.3":
        raise ValueError("This comparison requires the reviewed DockQ 2.1.3 distribution.")
    from DockQ.DockQ import calc_DockQ

    fixed = quality_model(reference, parent_codes[0], "reference:" + source_identities[0])
    mobile = quality_model(moving, parent_codes[1], "moving:" + source_identities[1])

    def residues(model):
        return {
            chain.id: [
                (
                    chain.sequence[i],
                    None,
                    {"chain": chain.id, "number": res.id[1], "insertion_code": res.id[2].strip()},
                )
                for i, res in enumerate(chain)
            ]
            for chain in model
        }

    # Native interface contacts include observed residues without CA; the two inventories differ.
    native_target, _ = mapped_pairs(
        residues(fixed), residues(mobile), options.target_mapping, options, "target"
    )
    native_partner, _ = mapped_pairs(
        residues(fixed), residues(mobile), options.partner_mapping, options, "partner"
    )
    before = [heavy_coordinates(model) for model in (fixed, mobile)]
    rows = []
    keys = (
        "DockQ",
        "F1",
        "iRMSD",
        "LRMSD",
        "fnat",
        "nat_correct",
        "nat_total",
        "fnonnat",
        "nonnat_count",
        "model_total",
        "clashes",
        "len1",
        "len2",
        "class1",
        "class2",
        "is_het",
    )
    for target in options.target_mapping:
        for partner in options.partner_mapping:
            maps = (target, partner)
            original = tuple(fixed[pair.reference] for pair in maps)
            sample = tuple(mobile[pair.moving] for pair in maps)
            alignments, inventories = [], []
            for mapping, role_pairs in zip(maps, (native_target, native_partner), strict=True):
                aligned, matched = explicit_alignment(
                    fixed[mapping.reference],
                    mobile[mapping.moving],
                    selected_pairs(role_pairs, mapping),
                )
                alignments.append(aligned)
                inventories.append(
                    {
                        "reference_chain": mapping.reference,
                        "moving_chain": mapping.moving,
                        "matched_identical": matched,
                    }
                )
            # Score only the explicitly selected cross-role interfaces, not antibody H/L packing.
            native = calc_DockQ(
                sample, original, tuple(alignments), capri_peptide=False, low_memory=False
            )
            if native is not None:
                if set(native) != set(keys):
                    raise ValueError(
                        "The native DockQ report schema differs from its reviewed version."
                    )
                if not all(
                    math.isfinite(float(value))
                    for value in native.values()
                    if isinstance(value, (int, float))
                ):
                    raise ValueError("Native reference-interface metrics must be finite.")
                native = {
                    key: value.item() if hasattr(value, "item") else value
                    for key, value in native.items()
                }
            rows.append(
                {
                    "target": target.model_dump(),
                    "partner": partner.model_dump(),
                    "state": "evaluated" if native else "no_reference_interface",
                    "metrics": native,
                    "correspondence": inventories,
                    "metric_scope": "native_backbone_and_observed_heavy_atom_reference_interface",
                }
            )
    if [heavy_coordinates(model) for model in (fixed, mobile)] != before:
        raise ValueError(
            "Native interface scoring mutated source coordinates or chemical identity."
        )
    return {
        "version": "2.1.3",
        "interfaces": rows,
        "mapping_method": "explicit_platform_correspondence_native_DockQ_core",
        "mutated_residue_scope": (
            "native_DockQ_identical_residues_only; primary_CA_RMSD_keeps_mutations"
        ),
        "quality_grade": None,
        "interpretation": "reference_conditioned_geometry_not_affinity_or_experimental_validation",
    }
