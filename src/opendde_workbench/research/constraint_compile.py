"""Compare immutable conditions to real native task parameters without relaxing them."""

from .constraint_contract import ConditionSupport, ConstraintExecution, ConstraintSet
from .regions import RegionInput


def compile_constraints(value: ConstraintSet, reference, request, regions):
    operation = request.operation
    mode = getattr(request, "mode", getattr(getattr(request, "payload", None), "mode", ""))
    conditions = []
    for condition in value.conditions:
        parameter, payload, code, reason = (
            None,
            None,
            "wrong_engine",
            "This engine/mode does not execute this condition.",
        )
        output_check = False
        if condition.strength == "soft" and condition.kind != "spatial_bounds":
            code, reason = (
                "soft_unsupported",
                "The native adapter cannot apply soft weights; no implicit relaxation is allowed.",
            )
        elif condition.kind == "fixed_region" and operation == "diffsbdd" and mode == "inpaint":
            selection = RegionInput.model_validate(regions.get(condition.region_id)["body"])
            region = next((r for r in selection.regions if r.name == condition.region_name), None)
            if value.subject != request.payload.initial or selection.subject != value.subject:
                code, reason = (
                    "wrong_subject",
                    "Fixed regions must use the exact initial molecule version.",
                )
            elif condition.scope != "subject":
                code, reason = (
                    "wrong_scope",
                    "Inpainting retains atoms on its input molecule, not on a target or assembly.",
                )
            elif region is None:
                code, reason = (
                    "missing_selection",
                    "The named region is absent from its immutable selection.",
                )
            elif not set(region.atom_indices).issubset(request.payload.options.fixed_atoms):
                code, reason = (
                    "different_parameters",
                    "Selected region atoms are not all present in native fixed_atoms.",
                )
            else:
                parameter, payload, code = (
                    "options.fixed_atoms",
                    list(region.atom_indices),
                    "native_fixed",
                )
                reason = "These exact native atom indices are submitted to inpainting."
        elif condition.kind == "spatial_bounds" and operation == "docking":
            if value.subject != request.ligand:
                code, reason = (
                    "wrong_subject",
                    "Output checks require the exact molecular input version.",
                )
            elif (
                not value.frame
                or value.frame.reference != request.receptor
                or value.frame.basis != "reference_coordinates"
            ):
                code, reason = (
                    "wrong_frame",
                    "Output bounds must use the exact receptor coordinates.",
                )
            elif condition.scope != "target_a":
                code, reason = (
                    "wrong_scope",
                    "This adapter checks one receptor frame, not a target B or assembly.",
                )
            else:
                output_check, payload, code = True, condition.box, "output_bounds"
                reason = (
                    "Independent heavy-atom coordinate verification after native execution; "
                    "no search guidance is claimed."
                )
        elif condition.kind == "search_box" and operation == "docking" and mode == "dock":
            search = request.search
            if value.subject != request.ligand:
                code, reason = (
                    "wrong_subject",
                    "The condition subject differs from the exact docking ligand version.",
                )
            elif not value.frame or value.frame.reference != request.receptor:
                code, reason = (
                    "wrong_frame",
                    "Search bounds must reference the exact receptor coordinate frame.",
                )
            elif value.frame.basis != "reference_coordinates":
                code, reason = (
                    "wrong_frame",
                    "An explicit search box uses coordinates read directly from its receptor.",
                )
            elif condition.scope != "target_a":
                code, reason = (
                    "wrong_scope",
                    "This adapter searches one receptor (target A), not target B or an assembly.",
                )
            elif getattr(search, "kind", None) != "box" or search.box != condition.box:
                code, reason = (
                    "different_parameters",
                    "The saved bounds and submitted native search box differ.",
                )
            else:
                parameter, payload, code = "search.box", condition.box, "native_box"
                reason = (
                    "These receptor-frame bounds are submitted to native search; "
                    "they do not constrain every final atom."
                )
        supported = parameter is not None or output_check
        conditions.append(
            ConditionSupport(
                condition_id=condition.id,
                support="result_check"
                if output_check
                else "native"
                if supported
                else "unsupported",
                phase=condition.phase,
                validator=condition.validator,
                supported=supported,
                reason=reason,
                reason_code=code,
                native_parameter=parameter,
                value=payload,
                independent_result_check="rdkit_receptor_bounds_v1"
                if output_check
                else "not_implemented",
            )
        )
    return ConstraintExecution(
        reference=reference,
        operation=operation,
        mode=mode,
        executable=all(c.supported for c in conditions),
        conditions=tuple(conditions),
        document=value,
    )
