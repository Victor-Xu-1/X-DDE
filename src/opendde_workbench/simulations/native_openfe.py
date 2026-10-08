"""OpenFE 1.12 RBFE: plan, run both native thermodynamic legs, then MBAR analysis."""

import json
from pathlib import Path

from native_fep_plan import build
from native_fep_result import combine, summarize
from native_io import csv_file, finish


def protocol(request):
    from openfe.protocols.openmm_rfe import RelativeHybridTopologyProtocol
    from openff.units import unit

    payload = request["payload"]
    settings = RelativeHybridTopologyProtocol.default_settings()
    settings.protocol_repeats = payload["repeats"]
    settings.thermo_settings.temperature = payload["temperature_kelvin"] * unit.kelvin
    settings.simulation_settings.production_length = payload["production_ns"] * unit.nanosecond
    settings.simulation_settings.equilibration_length = (
        payload["equilibration_ns"] * unit.nanosecond
    )
    settings.lambda_settings.lambda_windows = payload["lambda_windows"]
    settings.simulation_settings.n_replicas = payload["lambda_windows"]
    settings.engine_settings.compute_platform = request["options"]["device"]
    settings.solvation_settings.solvent_padding = 1 * unit.nanometer
    settings.partial_charge_settings.partial_charge_method = "am1bcc"
    settings.partial_charge_settings.off_toolkit_backend = "ambertools"
    return RelativeHybridTopologyProtocol(settings)


def run(request):
    import openfe
    from gufe.protocols.protocoldag import execute_DAG
    from openfe.protocols.openmm_utils.charge_generation import bulk_assign_partial_charges

    if openfe.__version__ != "1.12.0":
        raise ValueError("Install the reviewed OpenFE 1.12.0 environment.")
    network, nodes, edges, protein, solvent = build(request)
    payload = request["payload"]
    candidates = [
        {
            "id": n["id"],
            "artifact": n["artifact"],
            "smiles": n["smiles"],
            "metrics": [],
            "geometry": "source_frame",
        }
        for n in nodes
    ]
    summary = {
        "stage": payload["stage"],
        "method": "OpenFE hybrid topology / HREX / AM1-BCC / MBAR",
        "nodes": nodes,
        "edges": edges,
        "unit": "kcal/mol",
        "direction": "B minus A: complex leg minus solvent leg; negative favors B",
        "acceptance": "not_scientifically_accepted",
    }
    if payload["stage"] == "calculate":
        # Assign charges once per molecular state, then reuse them in both legs and all repeats.
        charged = bulk_assign_partial_charges(
            molecules=list(network.nodes),
            overwrite=False,
            method="am1bcc",
            toolkit_backend="ambertools",
            generate_n_conformers=1,
            nagl_model=None,
            processors=1,
        )
        by_name = {molecule.name: molecule for molecule in charged}
        native_protocol = protocol(request)
        for mapping, edge in zip(
            sorted(network.edges, key=lambda m: (m.componentA.name, m.componentB.name)),
            edges,
            strict=True,
        ):
            mapping = openfe.LigandAtomMapping(
                by_name[mapping.componentA.name],
                by_name[mapping.componentB.name],
                mapping.componentA_to_componentB,
                annotations=mapping.annotations,
            )
            legs = {}
            for leg in ("solvent", "complex"):
                components = {"solvent": solvent}
                if leg == "complex":
                    components["protein"] = protein
                state_a = openfe.ChemicalSystem({**components, "ligand": mapping.componentA})
                state_b = openfe.ChemicalSystem({**components, "ligand": mapping.componentB})
                transformation = openfe.Transformation(
                    stateA=state_a,
                    stateB=state_b,
                    mapping=mapping,
                    protocol=native_protocol,
                    name=edge["id"] + "-" + leg,
                )
                name = edge["id"] + "-" + leg
                transformation.to_json(Path("/output", name + "-plan.json"))
                work = Path("/output", "native", name)
                work.mkdir(parents=True)
                dag = transformation.create()
                dag_result = execute_DAG(
                    dag,
                    shared_basedir=work,
                    scratch_basedir=work,
                    keep_shared=True,
                    raise_error=True,
                    n_retries=0,
                )
                if not dag_result.ok():
                    raise ValueError("A native FEP leg failed; no binding free energy is reported.")
                result = native_protocol.gather([dag_result])
                result.to_json(Path("/output", name + "-native-result.json"))
                legs[leg] = summarize(result)
                # Native per-window trajectories and checkpoints are retained as a direct export.
                import shutil

                archive = shutil.make_archive(
                    str(Path("/output", name + "-simulation")), "zip", work
                )
                if Path(archive).stat().st_size > 1024**3:
                    raise ValueError("FEP native trajectory export exceeds its 1 GiB leg budget.")
            edge.update(combine(legs["complex"], legs["solvent"]))
        csv_file(
            "binding-free-energies.csv",
            [
                "ligand_A",
                "ligand_B",
                "delta_delta_G_kcal_mol",
                "uncertainty_kcal_mol",
                "minimum_adjacent_overlap",
                "quality",
            ],
            [
                [
                    e["a"],
                    e["b"],
                    e["delta_delta_g_kcal_mol"],
                    e["uncertainty_kcal_mol"],
                    e["minimum_adjacent_overlap"],
                    e["quality"],
                ]
                for e in edges
            ],
        )
    Path("/output/free-energy-network.json").write_text(json.dumps(summary, allow_nan=False))
    finish(
        request,
        openfe.__version__,
        candidates,
        free_energy=summary,
        structure_artifact="protein.pdb",
    )
