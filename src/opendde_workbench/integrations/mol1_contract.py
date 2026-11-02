"""Published Mol-1 base capabilities, with shared chemical and asset semantics."""

from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

from ..entities import Component, CovalentBond
from ..parameters import Parameters
from ..prediction import Prediction

COMPONENT_FILES = {
    "ligand_file": "ligand",
    "source_sequence": "sequence",
    "paired_msa": "msa",
    "unpaired_msa": "msa",
    "template_hits": "template",
}


class Mol1Payload(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    kind: Literal["mol1"] = "mol1"
    components: list[Component] = Field(min_length=1, max_length=8)
    covalent_bonds: list[CovalentBond] = Field(default_factory=list, max_length=100)
    samples: int = Field(default=5, ge=1, le=8)
    cycles: int = Field(default=20, ge=1, le=50)
    steps: int = Field(default=200, ge=1, le=1000)
    additional_seeds: list[int] = Field(default_factory=list, max_length=7)
    dtype: Literal["bf16", "fp32"] = "bf16"
    feature_mode: Literal["none", "uploaded", "search"] = "search"
    allow_network: bool = False
    use_template: bool = False
    use_rna_msa: bool = False
    atom_confidence: bool = True
    enable_tf32: bool = False
    enable_fusion: bool = True
    diffusion_cache_mode: Literal["full", "shared", "off"] = "full"
    attention_chunk: int = Field(default=512, ge=1, le=4096)
    msa_chunk: int = Field(default=1024, ge=1, le=4096)
    sample_chunk: int = Field(default=1, ge=1, le=8)
    msa_pair_as_unpair: bool = True

    @model_validator(mode="after")
    def compatible(self) -> Self:
        if self.sample_chunk > self.samples:
            raise ValueError("The simultaneous sample count exceeds the requested samples.")
        if any(seed < 0 or seed > 2147483647 for seed in self.additional_seeds):
            raise ValueError("Use bounded nonnegative model seeds.")
        # Use the shared entity/bond/feature checks, never the OpenDDE execution adapter.
        self.entity_request("Mol-1 input validation", 101)
        if self.use_rna_msa and any(
            c.kind == "rna" and not c.unpaired_msa for c in self.components
        ):
            raise ValueError(
                "Upload an RNA A3M alignment; the released Mol-1 data archives "
                "do not contain RNA search databases."
            )
        if self.feature_mode == "none" and any(
            c.paired_msa or c.unpaired_msa or c.template_hits for c in self.components
        ):
            raise ValueError("Remove inactive feature files or choose the supplied alignment mode.")
        if not self.use_template and any(c.template_hits for c in self.components):
            raise ValueError("Enable structural templates to use the selected template files.")
        for bond in self.covalent_bonds:
            for atom in (bond.left, bond.right):
                component = self.components[atom.entity - 1]
                if component.ligand_file and not atom.atom.isdecimal():
                    raise ValueError("File-ligand covalent endpoints use original atom indices.")
                if component.kind == "ligand" and not component.ligand_file:
                    if component.value.startswith("CCD_") and atom.atom.isdecimal():
                        raise ValueError("CCD covalent endpoints require their native atom names.")
                    if not component.value.startswith("CCD_") and (
                        not atom.atom.isdecimal() or int(atom.atom) < 1
                    ):
                        raise ValueError(
                            "SMILES covalent endpoints require positive explicit atom-map numbers."
                        )
            if (bond.left.copy_index is None) != (bond.right.copy_index is None):
                raise ValueError("Specify both covalent-bond copy indices, or neither.")
            if bond.left.copy_index is None and (
                self.components[bond.left.entity - 1].count
                != self.components[bond.right.entity - 1].count
            ):
                raise ValueError("Corresponding-copy covalent bonds require equal copy counts.")
            first, second = (self.components[atom.entity - 1] for atom in (bond.left, bond.right))
            if first.kind in {"protein", "dna", "rna"} and second.kind in {"protein", "dna", "rna"}:
                disulfide = all(
                    component.kind == "protein"
                    and component.value[atom.position - 1] == "C"
                    and atom.atom == "SG"
                    for component, atom in ((first, bond.left), (second, bond.right))
                )
                cyclic = (
                    first.kind == "protein"
                    and bond.left.entity == bond.right.entity
                    and bond.left.copy_index == bond.right.copy_index
                    and {
                        (bond.left.position, bond.left.atom),
                        (bond.right.position, bond.right.atom),
                    }
                    == {(1, "N"), (len(first.value), "C")}
                )
                if not (disulfide or cyclic):
                    raise ValueError(
                        "The released Mol-1 model supports polymer bonds only for "
                        "cysteine disulfides and head-to-tail cyclic peptides."
                    )
        return self

    def entity_request(self, name, seed):
        return Prediction(
            name=name,
            components=self.components,
            covalent_bonds=self.covalent_bonds,
            parameters=Parameters(
                seed=seed,
                feature_mode=self.feature_mode,
                allow_network=self.allow_network,
                use_template=self.use_template,
                use_rna_msa=self.use_rna_msa,
            ),
        )


def entity_request(task):
    request = task.payload.entity_request(task.name, task.options.seed)
    return request.model_copy(update={"scientific_inputs": task.scientific_inputs})


def validate_input_contract(task):
    request = entity_request(task)
    seeds = [task.options.seed, *task.payload.additional_seeds]
    if len(set(seeds)) != len(seeds):
        raise ValueError("Mol-1 seeds must be distinct.")
    expected = {
        (role, str(getattr(component, field)))
        for component in request.components
        for field, role in COMPONENT_FILES.items()
        if getattr(component, field)
    }
    actual = {(item.role, str(item.source.asset_id)) for item in task.inputs}
    if len(actual) != len(task.inputs) or actual != expected:
        raise ValueError("Bind every Mol-1 component file to its exact scientific input version.")
    if any(item.source.record or item.source.conformer for item in task.inputs):
        raise ValueError("Mol-1 file inputs require one original record/conformer.")


def inference_input(task, identifier, bindings):
    document = entity_request(task).inference_input(identifier, bindings)
    document[0]["modelSeeds"] = [task.options.seed, *task.payload.additional_seeds]
    return document
