"""Use upstream ligand-aware inverse folding at explicitly selected residue identities."""

import json
import sys
from pathlib import Path

from ligandmpnn_review import review_sequences
from native_components import restored_packed_components
from native_io import copy_artifact, csv_file, execute, finish, metric
from native_structure import input_pdb


def run(request):
    from Bio import SeqIO
    from Bio.PDB import PDBParser
    from Bio.PDB.Polypeptide import protein_letters_3to1

    source, reference = input_pdb(request, allow_component_aliases=True)
    structure = PDBParser(QUIET=True).get_structure("source", source)
    models = list(structure.get_models())
    if len(models) != 1:
        raise ValueError("Select one original structural model before sequence design.")
    if any(residue.is_disordered() == 2 for residue in structure.get_residues()) or any(
        atom.is_disordered() or atom.get_altloc().strip() for atom in structure.get_atoms()
    ):
        raise ValueError(
            "Choose explicit alternate locations in Structure preparation before sequence design."
        )
    identities = {
        f"{chain.id}{residue.id[1]}{residue.id[2].strip()}"
        for chain in models[0]
        for residue in chain
        if residue.id[0] == " "
    }
    payload, options = request["payload"], request["options"]
    if not set(payload["redesigned_residues"]) <= identities:
        raise ValueError("Selected design residues are absent from the exact input structure.")
    ligand_atoms = [
        atom
        for residue in structure.get_residues()
        if residue.id[0].startswith("H_")
        for atom in residue
        if atom.element not in {"H", "D"}
    ]
    residues = [
        {
            "identity": f"{chain.id}{residue.id[1]}{residue.id[2].strip()}",
            "amino_acid": protein_letters_3to1[residue.resname],
            "minimum_ligand_distance_A": min(
                (
                    float(atom - ligand)
                    for atom in residue
                    for ligand in ligand_atoms
                    if atom.element not in {"H", "D"}
                ),
                default=None,
            ),
        }
        for chain in models[0]
        for residue in chain
        if residue.id[0] == " " and residue.resname in protein_letters_3to1
    ]
    native = Path("/output/native")
    execute(
        [
            sys.executable,
            "/opt/native/run.py",
            "--pdb_path",
            source,
            "--out_folder",
            native,
            "--model_type",
            "ligand_mpnn",
            "--checkpoint_ligand_mpnn",
            "/models/ligandmpnn.pt",
            "--checkpoint_path_sc",
            "/models/sidechain.pt",
            "--redesigned_residues",
            " ".join(payload["redesigned_residues"]),
            "--seed",
            options["seed"],
            "--batch_size",
            "1",
            "--number_of_batches",
            payload["candidates"],
            "--temperature",
            payload["temperature"],
            "--pack_side_chains",
            int(payload["pack_sidechains"]),
            "--number_of_packs_per_design",
            "1",
            "--save_stats",
            "0",
        ]
    )
    files = list((native / "seqs").glob("*.fa"))
    if len(files) != 1:
        raise ValueError("LigandMPNN did not return a unique sequence result.")
    records = list(SeqIO.parse(files[0], "fasta"))
    # Keep the first (original) sequence in the download, but do not count it as a design.
    generated = records[1:]
    if len(generated) != payload["candidates"]:
        raise ValueError("LigandMPNN sequence count differs from the requested designs.")
    review = review_sequences(
        [(record.description, str(record.seq)) for record in records],
        residues,
        payload["redesigned_residues"],
    )
    Path("/output/sequence-design.json").write_text(json.dumps(review, allow_nan=False))
    fasta = copy_artifact(files[0], "designed-sequences.fasta")
    candidates = []
    for index, record in enumerate(generated, 1):
        candidates.append(
            {
                "id": f"sequence-{index:03d}",
                "sequence": str(record.seq),
                "artifact": fasta,
                "metrics": [
                    metric(
                        "Sequence likelihood",
                        review["candidates"][index - 1]["overall_likelihood"],
                        "1",
                        "Native exp(-mean NLL) on designed residues; not binding probability",
                    ),
                    *(
                        [
                            metric(
                                "Ligand-context likelihood",
                                review["candidates"][index - 1]["ligand_likelihood"],
                                "1",
                                "Native exp(-mean NLL) on nonempty ligand-neighborhood design mask",
                            )
                        ]
                        if review["native_ligand_scored_residues"]
                        else []
                    ),
                ],
                "geometry": "none",
            }
        )
    if payload["pack_sidechains"]:
        packed_files = list((native / "packed").glob("*.pdb"))
        if len(packed_files) != len(candidates):
            raise ValueError("Packed structures differ from the designed sequence count.")
        for index in range(1, len(candidates) + 1):
            matches = [p for p in packed_files if p.name.endswith(f"_packed_{index}_1.pdb")]
            if len(matches) != 1:
                raise ValueError("A packed structure has no unique native design identifier.")
            packed = matches[0]
            restored = restored_packed_components(packed, source, reference)
            if restored != packed:
                copy_artifact(packed, f"native-packed-{index:03d}.pdb")
            candidates[index - 1].update(
                artifact=copy_artifact(restored, f"packed-{index:03d}{restored.suffix}"),
                geometry="source_frame",
            )
        translation = source.with_name(source.stem + "-component-identifiers.json")
        if translation.is_file():
            copy_artifact(translation, "component-identifiers.json")
    csv_file(
        "sequences.csv",
        [
            "Candidate",
            "First identical sample",
            "Mutations",
            "Sequence likelihood",
            "Ligand-context likelihood",
            "Sequence recovery",
            "Sequence",
        ],
        [
            [
                row["id"],
                value["first_identical_sample"],
                ";".join(
                    item["residue"] + ":" + item["original"] + ">" + item["designed"]
                    for item in value["mutations"]
                ),
                value["overall_likelihood"],
                value["ligand_likelihood"] if value["ligand_likelihood"] is not None else "",
                value["sequence_recovery"],
                row["sequence"],
            ]
            for row, value in zip(candidates, review["candidates"], strict=True)
        ],
    )
    finish(request, "26ec57ac976ade5379920dbd43c7f97a91cf82de", candidates, sequence_design=review)
