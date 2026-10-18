"""Use upstream ligand-aware inverse folding at explicitly selected residue identities."""

import sys
from pathlib import Path

from native_components import restored_packed_components
from native_io import copy_artifact, csv_file, execute, finish
from native_structure import input_pdb


def run(request):
    from Bio import SeqIO
    from Bio.PDB import PDBParser

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
    fasta = copy_artifact(files[0], "designed-sequences.fasta")
    candidates = []
    for index, record in enumerate(generated, 1):
        candidates.append(
            {
                "id": f"sequence-{index:03d}",
                "sequence": str(record.seq),
                "artifact": fasta,
                "metrics": [],
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
        ["Candidate", "Sequence"],
        [[row["id"], row["sequence"]] for row in candidates],
    )
    finish(request, "26ec57ac976ade5379920dbd43c7f97a91cf82de", candidates)
