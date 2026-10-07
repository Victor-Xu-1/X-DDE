"""Bounded offline clustering of qualified poses, executed by the existing chemistry Worker."""

import csv
import hashlib
import shutil

from cluster_contacts import contact_similarity, contacts, read_receptor, verify_aligned_frame
from cluster_geometry import fixed_frame_rmsd, read_pose
from cluster_groups import cluster_groups
from cluster_options import ClusterOptions


def bound_file(ref, bindings, directory, suffix):
    binding = bindings[str(ref["asset_id"])]
    if not binding.startswith("/job/assets/"):
        raise ValueError("Clustering input is outside the managed task snapshot.")
    root = directory / "assets"
    file = directory / binding.removeprefix("/job/")
    if file.is_symlink() or not file.resolve().is_relative_to(root.resolve()):
        raise ValueError("Clustering input escapes its immutable snapshot.")
    if file.suffix != suffix or not 0 < file.stat().st_size <= 25 * 1024**2:
        raise ValueError("Clustering requires bounded PDB receptors and single-record SDF poses.")
    if ref.get("record", 0) or ref.get("conformer", 0):
        raise ValueError("Clustering accepts exact single-record pose/frame references.")
    if hashlib.sha256(file.read_bytes()).hexdigest() != ref["sha256"]:
        raise ValueError("Clustering input digest changed.")
    return file


def run_cluster(request, bindings, directory, output):
    import numpy as np
    from rdkit import rdBase

    options = ClusterOptions.model_validate(request["options"])
    if not 2 <= len(request["poses"]) <= 50 or not 1 <= len(request["receptors"]) <= 16:
        raise ValueError("Clustering input count exceeds its reviewed limits.")
    files = {}

    def resolve(ref, suffix):
        file = bound_file(ref, bindings, directory, suffix)
        files[str(ref["asset_id"])] = file
        if sum(path.stat().st_size for path in files.values()) > 256 * 1024**2:
            raise ValueError("Clustering source files exceed the 256 MiB total snapshot budget.")
        return file

    frame_file = resolve(request["frame"], ".pdb")
    frame = read_receptor(frame_file)
    receptors, receptor_files, frame_checks = {}, {}, []
    for item in request["receptors"]:
        index = item["member_index"]
        file = resolve(item["reference"], ".pdb")
        protein = read_receptor(file)
        observed = verify_aligned_frame(
            protein, frame, item["residue_pairs"], item["expected_alignment_rmsd_angstrom"]
        )
        receptors[index] = (protein, item)
        receptor_files[index] = file
        frame_checks.append({"member_index": index, "observed_rmsd_angstrom": observed})
    rows, geometries, fingerprints, pose_files, all_contacts = [], [], [], [], []
    distance_work = 0
    for index, item in enumerate(request["poses"]):
        file = resolve(item["reference"], ".sdf")
        geometry = read_pose(file)
        protein, receptor = receptors[item["member_index"]]
        distance_work += len(geometry.heavy_indices) * len(protein.residues)
        if distance_work > 50000000:
            raise ValueError(
                "Contact calculation exceeds 50 million atom pairs; select fewer poses."
            )
        fingerprint = contacts(
            geometry, protein, receptor["residue_pairs"], options.contact_cutoff_angstrom
        )
        matched, coverage, residue_rows = fingerprint
        all_contacts.extend({"pose": index, **row} for row in residue_rows)
        rows.append(
            {
                "index": index,
                "selection": item["selection"],
                "reference": item["reference"],
                "member_index": item["member_index"],
                "receptor": receptor["reference"],
                "identity_smiles": geometry.identity,
                "heavy_atom_count": len(geometry.heavy_indices),
                "contact_count": len(residue_rows),
                "mapped_contact_count": len(matched),
                "contact_mapping_coverage": coverage,
                "contacts": residue_rows[:50],
                "contacts_truncated": len(residue_rows) > 50,
                "pose_artifact": f"pose-{index:03d}.sdf",
                "receptor_artifact": f"receptor-{item['member_index']:02d}.pdb",
            }
        )
        geometries.append(geometry)
        fingerprints.append(fingerprint)
        pose_files.append(file)
    pairs, mapping_work = [], 0
    for left in range(len(rows)):
        for right in range(left + 1, len(rows)):
            rmsd, status, maps = fixed_frame_rmsd(
                geometries[left], geometries[right], options.maximum_symmetry_maps
            )
            mapping_work += maps * len(geometries[left].heavy_indices)
            if mapping_work > 5000000:
                raise ValueError(
                    "Atom mapping work exceeds its budget; select fewer symmetric poses."
                )
            jaccard, contact_status = contact_similarity(
                fingerprints[left], fingerprints[right], options.minimum_contact_mapping
            )
            pairs.append(
                {
                    "left": left,
                    "right": right,
                    "same_chemical_graph": geometries[left].identity == geometries[right].identity,
                    "rmsd_angstrom": rmsd,
                    "atom_mapping_status": status,
                    "symmetry_maps": maps,
                    "contact_jaccard": jaccard,
                    "contact_status": contact_status,
                }
            )
    clusters = cluster_groups(rows, pairs, options)
    artifacts = {}
    copied_bytes = 0

    def copy_source(file, name, expected):
        nonlocal copied_bytes
        copied_bytes += file.stat().st_size
        if copied_bytes > 256 * 1024**2:
            raise ValueError("Diagnostic copies exceed the 256 MiB output budget.")
        shutil.copyfile(file, output / name)
        digest = hashlib.sha256((output / name).read_bytes()).hexdigest()
        if digest != expected:
            raise ValueError("Source bytes changed while diagnostic previews were copied.")
        artifacts[name] = digest

    copy_source(frame_file, "frame.pdb", request["frame"]["sha256"])
    for index, file in receptor_files.items():
        copy_source(file, f"receptor-{index:02d}.pdb", receptors[index][1]["reference"]["sha256"])
    for row, file in zip(rows, pose_files, strict=True):
        copy_source(file, row["pose_artifact"], row["reference"]["sha256"])
    cluster_lookup = {member: group for group in clusters for member in group["members"]}
    with (output / "clusters.csv").open("w", newline="", encoding="utf-8") as stream:
        writer = csv.writer(stream)
        writer.writerow(
            [
                "pose",
                "step_id",
                "native_record",
                "cluster",
                "representative",
                "heavy_atoms",
                "geometric_contacts",
                "mapped_contacts",
            ]
        )
        for row in rows:
            group = cluster_lookup[row["index"]]
            writer.writerow(
                [
                    row["index"],
                    row["selection"]["step_id"],
                    row["selection"]["record"],
                    group["id"],
                    group["representative"] == row["index"],
                    row["heavy_atom_count"],
                    row["contact_count"],
                    row["mapped_contact_count"],
                ]
            )
    with (output / "pairs.csv").open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(pairs[0]))
        writer.writeheader()
        writer.writerows(pairs)
    with (output / "contacts.csv").open("w", newline="", encoding="utf-8") as stream:
        writer = csv.writer(stream)
        writer.writerow(
            [
                "pose",
                "chain",
                "residue",
                "insertion",
                "reference_chain",
                "reference_residue",
                "reference_insertion",
                "distance_angstrom",
            ]
        )
        for row in all_contacts:
            residue, mapped = row["residue"], row["reference_residue"] or {}
            writer.writerow(
                [
                    row["pose"],
                    residue["chain"],
                    residue["number"],
                    residue["insertion_code"],
                    mapped.get("chain", ""),
                    mapped.get("number", ""),
                    mapped.get("insertion_code", ""),
                    row["distance_angstrom"],
                ]
            )
    for name in ("clusters.csv", "pairs.csv", "contacts.csv"):
        artifacts[name] = hashlib.sha256((output / name).read_bytes()).hexdigest()
    return {
        "operation": "pose_cluster",
        "schema_version": 1,
        "complete": True,
        **{
            key: request[key]
            for key in (
                "pose_set_id",
                "pose_set_sha256",
                "site_set_sha256",
                "receptor_set_id",
                "receptor_set_sha256",
                "frame",
            )
        },
        "options": options.model_dump(mode="json"),
        "rows": rows,
        "pairs": pairs,
        "clusters": clusters,
        "frame_checks": frame_checks,
        "artifacts": artifacts,
        "method": "fixed_receptor_frame_symmetry_rmsd_mapped_contacts_complete_link_v1",
        "coordinate_unit": "angstrom",
        "ligand_superposition": False,
        "contact_scope": "provided_ATOM_heavy_protein_geometric_contacts",
        "cluster_count_interpretation": "sample_counts_not_mode_probability_or_affinity",
        "representative_method": "original_source_medoid",
        "versions": {"rdkit": rdBase.rdkitVersion, "numpy": np.__version__},
    }
