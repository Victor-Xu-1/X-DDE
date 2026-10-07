"""Read-only prerequisite projection; no provider calls or sensitive path disclosure."""

from .contract import CapabilityAvailability, CapabilitySpec
from ..integrations.specs import PROGRAMS


def availability(spec: CapabilitySpec, settings, readiness: dict) -> CapabilityAvailability:
    backends = readiness.get("backends", {"opendde": readiness})
    specific = ["native_input_validation", "selected_asset_versions"]
    if spec.environment == "platform":
        checks = {"platform_api": True}
        specific = (
            [
                "saved_site_set",
                "exact_state_and_conformer",
                "plan_digest",
                "gnina_native_preflight",
                "paired_receptor_frame",
                "job_and_wall_budget",
            ]
            if spec.id == "pose_exploration"
            else ["native_identity_task", "exact_molecule_record", "region_atom_membership"]
            if spec.id == "regions"
            else ["plan_digest", "per_step_native_preflight", "bound_output_versions", "budget"]
        )
        if spec.id == "experimental.evidence":
            specific = [
                "source_csv_digest",
                "reported_endpoint_units",
                "explicit_assay_conditions",
                "censoring_retained",
                "exact_material_links",
                "not_independently_verified_experiment",
            ]
    elif spec.environment == "discovery":
        checks = {"public_query_adapter": bool(backends.get("discovery", {}).get("ready"))}
        specific = [
            "explicit_identifier_selection",
            "public_query_consent",
            "source_response_limits",
            "source_availability",
            "bounded_coverage",
        ]
    elif spec.environment == "sapiens":
        checks = {"runtime": bool(backends.get("sapiens", {}).get("ready"))}
        specific = [
            "exact_variable_region_fasta",
            "fixed_native_models_and_human_peptide_reference",
            "protected_imgt_cdrs_and_original_cysteines",
            "bounded_framework_change_budget",
            "independent_candidate_numbering",
            "clinical_immunogenicity_not_predicted",
        ]
    elif spec.environment == "admet":
        checks = {"runtime": bool(backends.get("admet", {}).get("ready"))}
        specific = [
            "exact_chemical_records",
            "batch_up_to_50_records",
            "native_model_digests",
            "endpoint_species_and_units",
            "not_measured_or_clinically_validated",
        ]
    elif spec.environment == "posebusters":
        checks = {"runtime": bool(backends.get("posebusters", {}).get("ready"))}
    elif spec.environment == "anarcii":
        checks = {"runtime": bool(backends.get("anarcii", {}).get("ready"))}
        specific = [
            "exact_fasta_sequence_version",
            "numbered_domain_interval",
            "native_chain_type",
            "imgt_numbering",
            "bundled_model_digests",
            "internal_score_not_developability",
        ]
    elif spec.environment == "caver":
        checks = {"runtime": bool(backends.get("caver", {}).get("ready"))}
        specific = [
            "observed_starting_region",
            "explicit_context_and_alternates",
            "reviewed_element_radii",
            "proper_source_frame",
            "bounded_native_search",
            "not_whole_linker_passage_or_energy",
        ]
    elif spec.environment == "biopython":
        checks = {"runtime": bool(backends.get("biopython", {}).get("ready"))}
        specific.extend(
            (
                "selected_structural_models",
                "observed_ca_correspondence",
                "reference_frame",
                "alignment_budget",
                "backbone_and_ambiguity_checks",
            )
        )
        if spec.id == "biopython.exposure":
            specific = [
                "exact_observed_region",
                "selected_assembly_context",
                "reviewed_element_radii",
                "explicit_probe_and_resolution",
                "bounded_surface_sampling",
                "no_ambiguous_or_coincident_atoms",
                "not_affinity_or_linker_passage",
            ]
    elif spec.environment == "chemistry":
        checks = {"runtime": bool(backends.get("chemistry", {}).get("ready"))}
        specific.extend(
            (
                "state_budget",
                "chemical_applicability",
                "source_atom_correspondence",
                "force_field_parameters",
                "unbound_coordinate_frame",
            )
        )
        if spec.id == "chemistry.screen":
            specific = [
                "whole_sdf_library_up_to_500_records",
                "exact_query_record",
                "declared_selection_method",
                "invalid_records_preserved",
                "selected_output_budget",
                "chemical_criteria_not_activity",
                "explicit_structural_alert_policy",
                "scaffold_family_budget",
            ]
    elif spec.environment == "gnina":
        checks = {"runtime": bool(backends.get("gnina", {}).get("ready"))}
        specific.extend(
            (
                "receptor_coordinate_frame",
                "exact_molecule_state",
                "search_budget",
                "native_pose_validation",
            )
        )
    elif spec.environment == "p2rank":
        checks = {"runtime": bool(backends.get("p2rank", {}).get("ready"))}
        specific.extend(("structural_input", "structure_source_profile", "native_report"))
    elif spec.environment == "opendde":
        checks = {"runtime": bool(backends.get("opendde", {}).get("ready"))}
        if "predict" in spec.operations:
            specific.extend(("selected_checkpoint", "selected_device", "feature_resources"))
        elif "msa" in spec.operations:
            specific.append("selected_search_resources")
    elif spec.environment == "diffsbdd":
        checks = {"runtime": bool(backends.get("diffsbdd", {}).get("ready"))}
        if spec.native_mode in {"generate", "inpaint", "diversify", "optimize"}:
            specific.extend(("selected_model", "mode_model_compatibility", "gpu_and_budget"))
        if spec.native_mode == "inpaint":
            specific.append("fixed_atom_identity_and_bonds")
    elif spec.environment in PROGRAMS or spec.environment in {"drugclip", "deli"}:
        checks = {"runtime": bool(backends.get(spec.environment, {}).get("ready"))}
        specific.extend(
            (
                "native_input_roles",
                "selected_native_model",
                "bounded_execution",
                "exact_output_artifacts",
            )
        )
    else:
        checks = {
            "native_client": bool(settings.harness_python and settings.harness_python.is_file())
        }
        if spec.native_tool != "compare":
            checks["compute_configuration"] = bool(settings.harness_url)
        specific.append("native_tool_schema_and_resources")
        if spec.submission == "native_campaign":
            checks["shared_storage_configuration"] = bool(settings.harness_shared_dir)
            specific.extend(("native_design_config", "provider_configuration_and_limits"))
    return CapabilityAvailability(
        configuration_present=all(checks.values()),
        checks=checks,
        missing=tuple(key for key, value in checks.items() if not value),
        request_specific_checks=tuple(specific),
        scientific_validation=spec.scientific_validation,
    )
