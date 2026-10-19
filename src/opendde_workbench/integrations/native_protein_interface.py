"""Complete, source-bound protein-interface analysis in the existing PLIP container."""

from importlib.metadata import version
from pathlib import Path

from native_io import copy_artifact, csv_file, finish, input_file, metric
from native_structure import input_pdb
from plip_contacts import profile_contacts
from plip_interface_source import InterfaceCoordinates, annotated_source


def analyze_candidate(request, item, index):
    from plip.basic import config
    from plip.basic.supplemental import int32_to_negative
    from plip.exchange.report import StructureReport
    from plip.structure.preparation import PDBComplex

    selected = {**request, "inputs": [item]}
    original, reference = input_file(selected, "structure")
    converted, _ = input_pdb(selected, allow_component_aliases=True)
    source = annotated_source(converted, original, index)
    payload = request["payload"]
    coordinates = InterfaceCoordinates(source, payload["target_chains"], payload["binder_chains"])
    config.CHAINS = [payload["target_chains"], payload["binder_chains"]]
    config.PEPTIDES, config.REGIONS, config.INTRA = [], None, None
    config.KEEPMOD = True
    complex_ = PDBComplex()
    directory = Path("/output/native") / f"interface-{index}"
    directory.mkdir(parents=True, exist_ok=True)
    complex_.output_path = str(directory) + "/"
    complex_.load_pdb(str(source))

    def identity(residue):
        return (
            residue.GetChain(),
            int32_to_negative(residue.GetNum()),
            residue.GetName(),
            residue.GetInsertionCode().strip("\x00 "),
        )

    included = {identity(r) for r in complex_.resis if r.GetChain() in coordinates.targets}
    for ligand in complex_.ligands:
        included.update(identity(atom.OBAtom.GetResidue()) for atom in ligand.mol.atoms)
    expected = {
        r for r in coordinates.expected if r[0] in coordinates.targets | coordinates.binders
    }
    if included != expected:
        raise ValueError(
            "PLIP omitted or changed selected source polymer residues, including modifications."
        )
    complex_.analyze()
    rows = []
    for profile in complex_.interaction_sets.values():
        rows.extend(profile_contacts(profile, coordinates, annotate=coordinates.annotate))
        if len(rows) > 10000:
            raise ValueError("Interface contacts exceed the bounded 10,000-contact result budget.")
    stem = f"interface-{index:02d}"
    report = StructureReport(complex_, outputprefix=stem)
    report.write_xml()
    report.write_txt()
    xml = copy_artifact(directory / (stem + ".xml"), stem + ".xml")
    text = copy_artifact(directory / (stem + ".txt"), stem + ".txt")
    structure = copy_artifact(original, stem + original.suffix)
    table = csv_file(
        stem + ".csv",
        [
            "Type",
            "Target chain",
            "Target residue",
            "Target number",
            "Target insertion code",
            "Partner chain",
            "Partner residue",
            "Partner number",
            "Partner insertion code",
            "Endpoint distance (angstrom)",
            "Partner role",
        ],
        [
            [
                r["kind"],
                r["chain"],
                r["residue"],
                r["number"],
                r["insertion_code"],
                r["partner"]["chain"],
                r["partner"]["residue"],
                r["partner"]["number"],
                r["partner"]["insertion_code"],
                r["distance"],
                r["partner_role"],
            ]
            for r in rows
        ],
    )
    return {
        "name": payload["candidate_names"][index - 1],
        "source": reference,
        "structure_artifact": structure,
        "xml_artifact": xml,
        "text_artifact": text,
        "table_artifact": table,
        "interactions": rows,
        "polymer_residues": len(expected),
    }


def run(request):
    candidates = [
        analyze_candidate(request, item, index) for index, item in enumerate(request["inputs"], 1)
    ]
    finish(
        request,
        version("plip"),
        protein_interfaces=candidates,
        metrics=[
            metric(
                "Analyzed complexes",
                len(candidates),
                "count",
                "PLIP protein-interface analysis",
                "descriptor",
            )
        ],
    )
