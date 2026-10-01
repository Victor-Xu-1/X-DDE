"""Read-only prerequisite projection; no provider calls or sensitive path disclosure."""

from .contract import CapabilityAvailability, CapabilitySpec


def availability(spec: CapabilitySpec, settings, readiness: dict) -> CapabilityAvailability:
    backends = readiness.get("backends", {"opendde": readiness})
    specific = ["native_input_validation", "selected_asset_versions"]
    if spec.environment == "platform":
        checks = {"platform_api": True}
        specific = (
            ["native_identity_task", "exact_molecule_record", "region_atom_membership"]
            if spec.id == "regions"
            else ["plan_digest", "per_step_native_preflight", "bound_output_versions", "budget"]
        )
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
