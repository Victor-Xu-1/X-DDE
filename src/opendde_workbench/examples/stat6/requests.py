"""Only complete study requests are prefilled; missing experiment inputs stay explicit."""


def study_request(capability, objects, sequences):
    def reference(key):
        return objects[key].reference.model_dump(mode="json")

    if capability == "predict":
        return {
            "operation": "predict",
            "name": "STAT6 · defined-molecule complex prediction",
            "components": [
                {
                    "kind": "protein",
                    "value": sequences["protein"],
                    "count": 1,
                    "chain_ids": ["A"],
                    "source_sequence": str(objects["protein_sequence"].reference.asset_id),
                },
                {
                    "kind": "ligand",
                    "value": "",
                    "count": 1,
                    "chain_ids": ["B"],
                    "ligand_file": str(objects["ligand"].reference.asset_id),
                },
            ],
            "parameters": {
                "samples": 1,
                "seed": 20261009,
                "model": "standard",
                "feature_mode": "none",
                "allow_network": False,
            },
            "scientific_inputs": [reference("protein_sequence"), reference("ligand")],
        }
    if capability == "p2rank.detect":
        return {
            "operation": "pocket_search",
            "name": "STAT6 · candidate pockets",
            "protein": reference("receptor"),
            "profile": "experimental",
            "threads": 4,
            "memory_mib": 2048,
            "point_threshold": 0.4,
            "minimum_cluster": 3,
            "review_limit": 20,
        }
    if capability == "discovery.import":
        return {
            "operation": "reference_import",
            "name": "STAT6 · experimental reference",
            "source": "pdb",
            "identifier": "9BIG",
            "format": "cif",
            "allow_external": True,
        }
    if capability == "discovery.target":
        return {
            "operation": "target_research",
            "name": "STAT6 · target evidence",
            "entity": "target",
            "identifier": "ENSG00000166888",
            "allow_external": True,
        }
    if capability == "library.import":
        molecule = reference("ligand")
        return {
            "operation": "library_prepare",
            "name": "STAT6 · supplied study molecule",
            "inputs": [{"role": "data", "source": molecule}],
            "scientific_inputs": [molecule],
            "sources": [],
            "payload": {
                "kind": "chemistry",
                "mode": "prepare",
                "supplier": "custom",
                "library_name": "STAT6 study input",
                "id_column": "_Name",
                "smiles_column": "SMILES",
                "source_permission": "user_owned_file",
            },
        }
    # Other modules consume the shared target/material roles. In particular,
    # no unrelated wet measurements, antibodies, bound poses or FEP partner are fabricated.
    return None
