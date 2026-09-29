"""Translate native inference documents without trusting embedded filesystem paths."""

from .entities import BondAtom, Component, CovalentBond, Modification
from .parameters import Parameters
from .prediction import Prediction

KINDS = {
    "proteinChain": "protein",
    "dnaSequence": "dna",
    "rnaSequence": "rna",
    "ligand": "ligand",
    "ion": "ion",
}


def import_document(document: dict, resolve_file) -> Prediction:
    if not isinstance(document, dict):
        raise ValueError("An inference entry must be an object.")
    extra = set(document) - {"name", "modelSeeds", "sequences", "covalent_bonds"}
    if extra:
        raise ValueError("Unsupported native input fields: " + ", ".join(sorted(extra)))
    components = []
    for entity in document.get("sequences", []):
        if not isinstance(entity, dict) or len(entity) != 1:
            raise ValueError("Each entity must have one molecular type.")
        key, data = next(iter(entity.items()))
        if key not in KINDS or not isinstance(data, dict):
            raise ValueError("Unsupported native molecular entity.")
        kind = KINDS[key]
        value_key = "sequence" if kind in {"protein", "dna", "rna"} else kind
        allowed = {
            value_key,
            "count",
            "id",
            "modifications",
            "pairedMsaPath",
            "unpairedMsaPath",
            "templatesPath",
        }
        if set(data) - allowed:
            raise ValueError("Unsupported entity fields: " + ", ".join(sorted(set(data) - allowed)))
        value = data.get(value_key, "")
        if not isinstance(value, str):
            raise ValueError("Native molecular values must be text.")
        fields = {
            "kind": kind,
            "value": value,
            "count": data.get("count", 1),
            "chain_ids": data.get("id", []),
        }
        if kind == "ligand" and value.startswith("FILE_"):
            fields.update(value="", ligand_file=resolve_file(value[5:], "ligand"))
        for native, field, file_kind in [
            ("pairedMsaPath", "paired_msa", "msa"),
            ("unpairedMsaPath", "unpaired_msa", "msa"),
            ("templatesPath", "template_hits", "template"),
        ]:
            if data.get(native):
                fields[field] = resolve_file(data[native], file_kind)
        allowed_modification = (
            {"ptmType", "ptmPosition"}
            if kind == "protein"
            else {"modificationType", "basePosition"}
        )
        if any(
            not isinstance(m, dict) or set(m) != allowed_modification
            for m in data.get("modifications", [])
        ):
            raise ValueError("Invalid native residue modification fields.")
        fields["modifications"] = [
            Modification(
                position=m.get("ptmPosition", m.get("basePosition")),
                ccd=m.get("ptmType", m.get("modificationType")),
            )
            for m in data.get("modifications", [])
        ]
        components.append(Component.model_validate(fields))
    bonds = []
    for bond in document.get("covalent_bonds", []):
        allowed_bond = {
            f"{key}{index}" for key in ("entity", "copy", "position", "atom") for index in (1, 2)
        }
        if not isinstance(bond, dict) or set(bond) - allowed_bond:
            raise ValueError("Unsupported native covalent-bond fields.")
        ends = [
            BondAtom(
                entity=int(bond[f"entity{i}"]),
                copy_index=int(bond[f"copy{i}"]) if bond.get(f"copy{i}") is not None else None,
                position=int(bond[f"position{i}"]),
                atom=str(bond[f"atom{i}"]),
            )
            for i in (1, 2)
        ]
        bonds.append(CovalentBond(left=ends[0], right=ends[1]))
    seeds = document.get("modelSeeds", [101])
    if not isinstance(seeds, list) or not seeds:
        raise ValueError("modelSeeds must be a nonempty list.")
    protein = [c for c in components if c.kind == "protein"]
    rna = [c for c in components if c.kind == "rna"]
    uploaded = bool(protein or rna) and all(
        c.unpaired_msa or c.kind == "protein" and c.paired_msa for c in protein + rna
    )
    return Prediction(
        name=str(document.get("name") or "Imported structure")[:80],
        components=components,
        covalent_bonds=bonds,
        parameters=Parameters(
            seed=seeds[0],
            additional_seeds=seeds[1:],
            feature_mode="uploaded" if uploaded else "none",
            use_template=uploaded and bool(protein) and all(c.template_hits for c in protein),
            use_rna_msa=uploaded and bool(rna),
        ),
    )
