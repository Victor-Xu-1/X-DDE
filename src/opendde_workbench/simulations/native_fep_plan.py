"""Reviewed OpenFE congeneric networks with exact original record identities."""

from pathlib import Path

from native_io import copy_artifact, input_file
from native_structure import input_pdb


def build(request):
    import numpy as np
    import openfe
    from rdkit import Chem

    file, _ = input_file(request, "library")
    records = Chem.SDMolSupplier(str(file), removeHs=False)
    selected = []
    nodes = []
    charge = None
    for record in request["payload"]["records"]:
        if record >= len(records) or records[record] is None:
            raise ValueError("A selected original ligand record is absent or invalid.")
        molecule = records[record]
        if len(Chem.GetMolFrags(molecule)) != 1 or not 5 <= molecule.GetNumHeavyAtoms() <= 150:
            raise ValueError("FEP requires connected drug-like ligands of 5–150 heavy atoms.")
        if not molecule.GetNumConformers() or not molecule.GetConformer().Is3D():
            raise ValueError("Prepare aligned calculated 3D binding poses before FEP.")
        if not np.isfinite(molecule.GetConformer().GetPositions()).all():
            raise ValueError("FEP ligand coordinates are invalid.")
        formal = Chem.GetFormalCharge(molecule)
        if charge is not None and formal != charge:
            raise ValueError(
                "This reviewed FEP protocol excludes net-charge-changing transformations."
            )
        charge = formal
        name = f"ligand-{record + 1}"
        hydrogenated = Chem.AddHs(molecule, addCoords=True)
        component = openfe.SmallMoleculeComponent.from_rdkit(hydrogenated, name=name)
        selected.append(component)
        artifact = name + ".sdf"
        with Chem.SDWriter(str(Path("/output", artifact))) as writer:
            writer.write(molecule)
        nodes.append(
            {
                "id": name,
                "record": record,
                "artifact": artifact,
                "smiles": Chem.MolToSmiles(molecule, isomericSmiles=True),
            }
        )
    if len({node["smiles"] for node in nodes}) != len(nodes):
        raise ValueError(
            "Select distinct chemical states; duplicate compounds do not define FEP edges."
        )
    source, _ = input_pdb(request)
    copy_artifact(source, "protein.pdb")
    from openmm import app

    protein_topology = app.PDBFile(str(source)).topology
    standard = {
        "ALA",
        "ARG",
        "ASN",
        "ASP",
        "CYS",
        "CYX",
        "GLN",
        "GLU",
        "GLY",
        "HIS",
        "HID",
        "HIE",
        "HIP",
        "ILE",
        "LEU",
        "LYS",
        "MET",
        "PHE",
        "PRO",
        "SER",
        "THR",
        "TRP",
        "TYR",
        "VAL",
        "HOH",
        "WAT",
    }
    if any(residue.name not in standard for residue in protein_topology.residues()):
        raise ValueError(
            "Use a prepared protein-only structure; cofactors/metals need a specialized protocol."
        )
    coordinates = np.asarray(
        app.PDBFile(str(source)).positions.value_in_unit(__import__("openmm").unit.angstrom)
    )
    for component in selected:
        positions = component.to_rdkit().GetConformer().GetPositions()
        # Bound poses must share the submitted protein frame, not isolated centered conformers.
        if min(np.linalg.norm(coordinates - point, axis=1).min() for point in positions) > 6:
            raise ValueError(
                "Ligand poses are outside the protein frame; align or dock them before FEP."
            )
    mapper = openfe.LomapAtomMapper(max3d=1.0, element_change=False)
    scorer = openfe.lomap_scorers.default_lomap_score
    planner = (
        openfe.ligand_network_planning.generate_minimal_redundant_network
        if request["payload"]["network"] == "redundant" and len(selected) > 2
        else openfe.ligand_network_planning.generate_minimal_spanning_network
    )
    network = planner(ligands=selected, mappers=[mapper], scorer=scorer)
    edges = []
    for index, mapping in enumerate(
        sorted(network.edges, key=lambda m: (m.componentA.name, m.componentB.name))
    ):
        score = float(mapping.annotations["score"])
        if score < 0.3:
            raise ValueError("A proposed change is too dissimilar; use a closer congeneric series.")
        edges.append(
            {
                "id": f"edge-{index + 1}",
                "a": mapping.componentA.name,
                "b": mapping.componentB.name,
                "mapping_score": score,
                "atom_map": [[int(a), int(b)] for a, b in mapping.componentA_to_componentB.items()],
            }
        )
    if not edges or len(edges) > 66:
        raise ValueError("FEP planning did not produce a bounded connected network.")
    (Path("/output") / "ligand-network.graphml").write_text(network.to_graphml())
    return (
        network,
        nodes,
        edges,
        openfe.ProteinComponent.from_pdb_file(source),
        openfe.SolventComponent(),
    )
