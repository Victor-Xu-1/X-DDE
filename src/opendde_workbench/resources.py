"""Presence inventory for operator-managed native resources; never implies hash verification."""

from pathlib import Path

DATABASES = {
    "templates": ["pdb_seqres_2022_09_28.fasta"],
    "rna": [
        "nt_rna_2023_02_23_clust_seq_id_90_cov_80_rep_seq.fasta",
        "rfam_14_9_clust_seq_id_90_cov_80_rep_seq.fasta",
        "rnacentral_active_seq_id_90_cov_80_linclust.fasta",
    ],
}


def resource_inventory(root: Path) -> dict:
    return {
        **{
            key: all((root / "search_database" / name).is_file() for name in names)
            for key, names in DATABASES.items()
        },
        "common": all(
            (root / "common" / name).is_file()
            for name in [
                "components.cif",
                "components.cif.rdkit_mol.pkl",
                "release_date_cache.json",
                "obsolete_to_successor.json",
            ]
        ),
    }
