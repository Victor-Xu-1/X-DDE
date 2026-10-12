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
        "chemprop.train": ("chemprop_train", "chemprop"),
    }
    if capability not in programs:
        return None
    operation, kind = programs[capability]
    payload, inputs = {"kind": kind}, []

    def add(role, key):
        reference = objects[key].reference
        inputs.append({"role": role, "source": reference})
        return reference

    if kind == "boltz":
        ligand = add("ligand", "study_ligand")
        payload["components"] = [
            MolecularComponent(id="A", kind="protein", value=sequences["protein"]),
            MolecularComponent(id="B", kind="ligand", source=ligand),
        ]
        payload["samples"] = 3
    elif kind == "reinvent":
        add("ligand", "study_ligand")
        payload.update(mode="analogues", candidates=50)
    elif kind == "chemprop":
        add("library", "stat6_assay_library")
        payload.update(mode="train", activity_property="pIC50", activity_unit="pIC50", epochs=30)
    else:
        add("structure", "structure" if kind in {"ligandmpnn", "plip"} else "receptor")
        if kind == "ligandmpnn":
            payload.update(redesigned_residues=["A614"], candidates=8)
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
        options={
            "device": "cuda" if kind in {"boltz", "boltzgen"} else "cpu",
            "cpu": 2,
            "memory_mib": 24576 if kind in {"boltz", "boltzgen"} else 4096,
        },
    ).model_dump(mode="json")
