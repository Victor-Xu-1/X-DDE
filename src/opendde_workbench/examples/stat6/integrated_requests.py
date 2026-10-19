"""Reviewed input roles and sensible presets for native integrated research tasks."""

from ...integrations.contract import IntegratedTask
from ...integrations.options import MolecularComponent


def integrated_study(capability, objects, sequences):
    programs = {
        "boltz.predict": ("boltz_predict", "boltz"),
        "reinvent.design": ("reinvent_design", "reinvent"),
        "ligandmpnn.design": ("ligandmpnn_design", "ligandmpnn"),
        "boltzgen.design": ("boltzgen_design", "boltzgen"),
        "openmm.refine": ("structure_refine", "openmm"),
        "apbs.potential": ("electrostatics", "apbs"),
        "plip.profile": ("interaction_profile", "plip"),
        "structure": ("protein_interface", "plip"),
        "chemprop.train": ("chemprop_train", "chemprop"),
    }
    if capability not in programs:
        return None
    operation, kind = programs[capability]
    payload, inputs = {"kind": kind}, []
    options = {
        "device": "cuda" if kind in {"boltz", "boltzgen"} else "cpu",
        "cpu": 2,
        "memory_mib": 24576 if kind in {"boltz", "boltzgen"} else 4096,
    }

    def add(role, key):
        reference = objects[key].reference
        inputs.append({"role": role, "source": reference})
        return reference

    if operation == "protein_interface":
        add("structure", "stat6_alternative")
        payload.update(
            scope="protein_interface",
            target_chains=["A"],
            binder_chains=["B"],
            candidate_names=["STAT6 4Y5U phosphorylated A/B dimer"],
        )
    elif kind == "boltz":
        ligand = add("ligand", "study_ligand")
        payload["components"] = [
            MolecularComponent(id="A", kind="protein", value=sequences["protein"]),
            MolecularComponent(id="B", kind="ligand", source=ligand),
        ]
        payload["samples"] = 3
    elif kind == "reinvent":
        add("ligand", "study_ligand")
        payload.update(
            mode="r_groups",
            fragments=["CN(C)C(=O)c1cc2ccc([*:1])c(F)c2[nH]1"],
            validate_scaffold_origin=True,
            candidates=20,
        )
        options.update(memory_mib=2048, seed=2026)
    elif kind == "chemprop":
        add("library", "stat6_spr_library")
        payload.update(mode="train", activity_property="pKd", activity_unit="pKd", epochs=30)
    elif kind == "openmm":
        # The observed crystal receptor has unresolved internal segments. Do not
        # turn missing SEQRES records into apparently continuous peptide bonds.
        add("structure", "stat6_predicted_construct")
        options.update(memory_mib=2048, seed=2026)
    else:
        add("structure", "structure" if kind in {"ligandmpnn", "plip"} else "receptor")
        if kind == "ligandmpnn":
            # Prepared 9BIG author residues have complete backbones and measured
            # heavy-atom contacts to the retained AK-1690 reference ligand.
            payload.update(
                redesigned_residues=["A566", "A588", "A590"], candidates=8, temperature=0.2
            )
            options.update(memory_mib=2048, seed=2026)
        elif kind == "boltzgen":
            payload.update(
                modality="protein", target_chains=["A"], candidates=20, retain=5, length=[80, 120]
            )
        elif kind == "plip":
            payload.update(ligand_chain="A", ligand_number=701)
    return IntegratedTask(
        operation=operation,
        name=("STAT6 · " + capability)[:80],
        inputs=inputs,
        scientific_inputs=[i["source"] for i in inputs],
        payload=payload,
        options=options,
    ).model_dump(mode="json")
