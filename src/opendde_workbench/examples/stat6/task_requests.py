"""Task-specific drafts built against the existing validated task contracts."""

from ...capabilities.definitions import CAPABILITIES


def study_task(capability, objects, sequences):
    """Return complete requests only; upstream-dependent tasks have explicit stage plans."""

    def ref(key):
        return objects[key].reference.model_dump(mode="json")

    operation = CAPABILITIES[capability].operations
    title = "STAT6 · " + CAPABILITIES[capability].label[1]
    if not operation:
        return None
    value = {"operation": operation[0], "name": title[:80]}
    receptor, ligand = ref("receptor"), ref("ligand") if "ligand" in objects else None
    if capability in {"gnina.dock", "gnina.score", "gnina.minimize"}:
        mode = capability.split(".")[1]
        value.update(mode=mode, receptor=receptor, ligand=ligand)
        if mode == "dock":
            value["search"] = {
                "kind": "reference_ligand",
                "frame": receptor,
                "reference": ref("pocket_reference"),
                "coordinate_basis": "user_confirmed",
            }
        else:
            value.update(pose_frame=receptor, pose_coordinate_basis="user_confirmed")
        value["options"] = {"cpu": 1, "cnn_scoring": "none", "use_gpu": False}
    elif capability.startswith("diffsbdd."):
        mode = capability.split(".")[1]
        payload = {"mode": mode}
        if mode in {"generate", "inpaint", "diversify", "optimize", "pocket"}:
            payload.update(
                protein=receptor, pocket={"kind": "ligand", "ligand": ref("pocket_reference")}
            )
            if mode in {"inpaint", "diversify", "optimize"}:
                payload.update(initial=ligand, options={"task": mode, "count": 10})
                if mode == "inpaint":
                    # Reviewable zero-based atoms of the actual starting molecule.
                    atoms = [8, 9, 10, 11, 12, 13]
                    payload["options"]["fixed_atoms"] = atoms
                    payload["options"]["fragment_policy"] = "all"
                    payload["fixed_atoms"] = [{"molecule": ligand, "index": i} for i in atoms]
            elif mode == "generate":
                payload["options"] = {"task": mode, "count": 10}
        elif mode == "prepare":
            payload.update(
                protein=ref("structure"),
                chains=["A"],
                remove_water=True,
                keep_ligands=True,
                remove_hydrogens=False,
            )
        elif mode == "interactions":
            payload.update(protein=receptor, molecule=ligand)
        elif mode in {"properties", "export"}:
            payload["molecules"] = [ligand]
        else:
            return None
        value["payload"] = payload
    elif capability == "posebusters.check":
        value.update(
            molecule=ligand,
            protein=receptor,
            coordinate_basis="user_confirmed",
            options={"profile": "dock", "cpu": 1},
            scientific_inputs=[ligand, receptor],
        )
    elif capability == "properties":
        value["ligand_files"] = [ligand["asset_id"]]
    elif capability == "import":
        value["assets"] = [ref("structure")["asset_id"]]
    elif capability == "resources":
        value["operation"] = "doctor"
    elif capability == "biopython.prepare":
        value.update(
            structure=ref("structure"),
            scientific_inputs=[ref("structure")],
            # The frozen 9BIG construct has A at all eight alternate atom sites.
            options={"chains": ["A"], "alternate": "A", "format": "cif"},
        )
    elif capability == "biopython.ensemble":
        value.update(
            inputs=[
                {"structure": ref(key), "selection": {"chains": ["A"], "profile": "experimental"}}
                for key in ("receptor_a", "receptor_b")
            ]
        )
    elif capability in {"biopython.exposure", "caver.paths"}:
        field = "regions" if capability == "biopython.exposure" else "starting_regions"
        value.update(
            structure=receptor,
            scientific_inputs=[receptor],
            **{field: [{"chain": "A", "number": 614, "insertion_code": "", "resname": "ASN"}]},
        )
    elif capability == "chemistry.states":
        value.update(molecule=ligand, scientific_inputs=[ligand])
    elif capability == "admet.predict":
        value.update(molecule=ligand, scientific_inputs=[ligand])
    elif capability == "chemistry.screen":
        value.update(
            library={"asset_id": ref("library")["asset_id"], "sha256": ref("library")["sha256"]}
        )
    elif capability in {"antibody.number", "antibody.humanize"}:
        sequence = ref("variable_domains")
        value.update(
            name="STAT6 pathway · dupilumab variable domains",
            sequences=sequence,
            scientific_inputs=[sequence],
        )
        if capability == "antibody.humanize":
            value["options"] = {
                "mode": "evaluate",
                "format": "conventional",
                "max_mutations": 0,
                "iterations": 1,
            }
    else:
        return None
    from ...requests import TASK_ADAPTER

    return TASK_ADAPTER.validate_python(value).model_dump(mode="json")
