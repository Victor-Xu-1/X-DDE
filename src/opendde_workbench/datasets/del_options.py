"""Explicit DEL experiment design, comparisons and bounded native analysis choices."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_serializer, model_validator


class DELSample(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    column: str = Field(min_length=1, max_length=100, pattern=r"^[^\x00-\x1f]+$")
    group: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")
    role: Literal["target", "input", "ntc", "matrix", "competition", "counter_target", "reference"]
    replicate: int = Field(default=1, ge=1, le=100)
    round: int = Field(default=1, ge=0, le=50)
    batch: str = Field(default="1", min_length=1, max_length=40)


class DELComparison(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    id: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")
    selection: str
    reference: str


class DELReadSample(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    input_label: str = Field(min_length=1, max_length=120)
    sample: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")
    sample_barcode: str = Field(default="", max_length=32, pattern=r"^[ACGT]*$")
    mate_label: str = Field(default="", max_length=120)
    encoded_mate: Literal["r1", "r2"] = "r1"

    @model_serializer(mode="wrap")
    def stable_wire(self, handler):
        value = handler(self)
        if not self.mate_label:
            value.pop("mate_label", None)
        if self.encoded_mate == "r1":
            value.pop("encoded_mate", None)
        return value


class DELOptions(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["deli"] = "deli"
    mode: Literal[
        "validate",
        "enumerate",
        "decode",
        "count",
        "analyze",
        "series",
        "model",
        "candidates",
        "followup",
    ]
    library: str = Field(default="", max_length=64, pattern=r"^[A-Za-z0-9_-]*$")
    selected_members: list[list[str]] = Field(default_factory=list, max_length=500)
    enumerate_all: bool = False
    max_members: int = Field(default=1000000, ge=1, le=10000000)
    max_reads: int = Field(default=10000000, ge=1, le=1000000000)
    expanded_bytes: int = Field(default=50 * 1024**3, ge=1024, le=200 * 1024**3)
    read_samples: list[DELReadSample] = Field(default_factory=list, max_length=64)
    reverse_complement: bool = True
    library_errors: int = Field(default=1, ge=0, le=2)
    barcode_errors: int = Field(default=1, ge=0, le=2)
    min_library_overlap: int = Field(default=8, ge=4, le=30)
    min_mean_quality: int = Field(default=0, ge=0, le=40)
    min_read_length: int = Field(default=20, ge=10, le=1000)
    max_read_length: int = Field(default=500, ge=20, le=5000)
    umi_method: Literal["raw", "unique", "directional", "cluster"] = "directional"
    max_umis_per_member: int = Field(default=100000, ge=1, le=1000000)
    id_column: str = Field(default="DEL_ID", min_length=1, max_length=100)
    smiles_column: str = Field(default="SMILES", max_length=100)
    cycle_columns: list[str] = Field(default_factory=list, max_length=8)
    delimiter: Literal[",", "\t"] = ","
    count_unit: Literal["reads", "unique_umi", "corrected_umi"] = "corrected_umi"
    samples: list[DELSample] = Field(default_factory=list, max_length=64)
    comparisons: list[DELComparison] = Field(default_factory=list, max_length=16)
    library_size: int | None = Field(default=None, ge=2, le=10000000000)
    minimum_counts: int = Field(default=10, ge=1, le=1000000)
    minimum_enrichment: float = Field(default=3, gt=0, le=1000000, allow_inf_nan=False)
    retain: int = Field(default=100, ge=1, le=500)
    chosen_comparison: str = Field(default="", max_length=64)
    selected_ids: list[str] = Field(default_factory=list, max_length=500)
    attachment_policy: Literal["retain", "cap_hydrogen"] = "retain"
    series_cycles: tuple[int, int] = (0, 1)
    maximum_series: int = Field(default=2000, ge=10, le=10000)
    holdout_cycle: int = Field(default=0, ge=0, le=7)
    holdout_fraction: float = Field(default=0.2, ge=0.1, le=0.4)
    max_training_members: int = Field(default=50000, ge=100, le=200000)
    trees: int = Field(default=200, ge=50, le=500)
    followup_id_column: str = Field(default="DEL_ID", min_length=1, max_length=100)
    followup_value_column: str = Field(default="value", min_length=1, max_length=100)
    followup_endpoint: Literal["KD", "IC50", "EC50", "inhibition"] = "KD"
    followup_unit: Literal["nM", "uM", "percent"] = "nM"

    @model_serializer(mode="wrap")
    def stable_wire(self, handler):
        value = handler(self)
        if self.attachment_policy == "retain":
            value.pop("attachment_policy", None)
        return value

    @model_validator(mode="after")
    def study_design(self):
        if self.min_read_length > self.max_read_length:
            raise ValueError("Choose a valid read-length range.")
        if len({sample.column for sample in self.samples}) != len(self.samples):
            raise ValueError("Each count column represents one explicitly assigned sample.")
        groups = {sample.group for sample in self.samples}
        for group in groups:
            members = [sample for sample in self.samples if sample.group == group]
            if len({sample.role for sample in members}) != 1:
                raise ValueError(
                    "Keep target and different reference types in separate study groups."
                )
            keys = [(sample.replicate, sample.batch, sample.round) for sample in members]
            if len(set(keys)) != len(keys):
                raise ValueError(
                    "Assign independent replicate numbers; combine technical lanes explicitly."
                )
        if len({comparison.id for comparison in self.comparisons}) != len(self.comparisons):
            raise ValueError("Choose unique comparison names.")
        for comparison in self.comparisons:
            if (
                comparison.selection == comparison.reference
                or not {comparison.selection, comparison.reference} <= groups
            ):
                raise ValueError(
                    "Each enrichment comparison needs distinct observed selection/reference groups."
                )
            selection = [sample for sample in self.samples if sample.group == comparison.selection]
            reference = [sample for sample in self.samples if sample.group == comparison.reference]
            if any(sample.role != "target" for sample in selection):
                raise ValueError("An enrichment selection group must consist of target samples.")
            if any(sample.role == "target" for sample in reference):
                raise ValueError(
                    "Choose an explicit input, negative, competition or counter-target reference."
                )
            if {sample.batch for sample in selection} != {sample.batch for sample in reference}:
                raise ValueError(
                    "Compare matched batches; create separate comparisons for unmatched studies."
                )
            if any(sample.role != "input" for sample in reference) and {
                sample.round for sample in selection
            } != {sample.round for sample in reference}:
                raise ValueError("Negative/competition references must match selection rounds.")
        if len(set(self.cycle_columns)) != len(self.cycle_columns):
            raise ValueError("Choose each observed building-block cycle column once.")
        if self.mode == "analyze" and not self.samples:
            raise ValueError("Assign the count columns to observed study samples before analysis.")
        if self.mode == "decode" and not self.read_samples:
            raise ValueError(
                "Assign each sequencing file to its sample or explicit sample barcodes."
            )
        if any(
            sample.mate_label == sample.input_label
            or (sample.encoded_mate == "r2" and not sample.mate_label)
            for sample in self.read_samples
        ):
            raise ValueError(
                "Paired reads need distinct files; select the mate carrying the DEL code."
            )
        if any(
            not 2 <= len(member) <= 8
            or any(
                not identifier
                or len(identifier) > 120
                or any(ord(char) < 32 for char in identifier)
                for identifier in member
            )
            for member in self.selected_members
        ):
            raise ValueError("Each selected DEL member needs two to eight explicit cycle IDs.")
        if len({tuple(member) for member in self.selected_members}) != len(self.selected_members):
            raise ValueError("Choose each complete DEL member once.")
        if self.mode == "enumerate" and not (self.selected_members or self.enumerate_all):
            raise ValueError("Choose explicit DEL members or confirm full-library enumeration.")
        if self.mode in {"series", "model"} and not self.chosen_comparison:
            raise ValueError("Choose one completed enrichment comparison.")
        if self.mode == "candidates" and (
            not self.selected_ids or len(set(self.selected_ids)) != len(self.selected_ids)
        ):
            raise ValueError("Choose explicit unique DEL members for the follow-up candidate set.")
        if self.series_cycles[0] == self.series_cycles[1] or any(
            not 0 <= value <= 7 for value in self.series_cycles
        ):
            raise ValueError("Choose two distinct observed building-block cycles.")
        if (self.followup_endpoint == "inhibition") != (self.followup_unit == "percent"):
            raise ValueError("Inhibition uses percent; concentration endpoints use nM or uM.")
        return self
