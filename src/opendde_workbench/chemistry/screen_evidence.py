"""Versioned structural-alert/scaffold evidence; historical reports remain unevaluated."""

from typing import Literal

from pydantic import Field, model_validator

from ..scientific_objects import ScientificModel


class StructuralAlert(ScientificModel):
    catalogue: Literal["PAINS", "BRENK"]
    rule: str = Field(min_length=1, max_length=200)


class ScaffoldGroup(ScientificModel):
    index: int = Field(ge=0, le=499)
    kind: Literal["murcko", "acyclic"]
    smiles: str = Field(min_length=1, max_length=10000)
    records: tuple[int, ...] = Field(min_length=1, max_length=500)

    @model_validator(mode="after")
    def unique_records(self):
        if list(self.records) != sorted(set(self.records)) or any(
            not 0 <= record <= 499 for record in self.records
        ):
            raise ValueError("Scaffold records must be unique original record indices.")
        return self


def validate_inspection(result):
    options = result.options
    if result.schema_version == 1:
        if (
            options.mode in {"alerts", "scaffold"}
            or options.alert_policy != "off"
            or result.scaffold_groups is not None
            or result.scaffold_method is not None
            or result.report_artifact is not None
            or result.report_sha256 is not None
            or any(
                row.structural_alerts is not None or row.scaffold_group is not None
                for row in result.rows
            )
        ):
            raise ValueError("Historical library results cannot claim newly computed inspections.")
        return
    if result.report_artifact is None or result.report_sha256 is None:
        raise ValueError("A current library result requires its actual tabular report.")
    permitted = {"PAINS"} if options.alert_catalogue == "pains" else {"PAINS", "BRENK"}
    for row in result.rows:
        if (
            row.reason_code in {"scaffold_quota", "multiple_fragments"}
            and options.mode != "scaffold"
        ):
            raise ValueError("Scaffold-specific reasons require scaffold selection.")
        evaluated = row.available and options.alert_policy != "off"
        if evaluated != (row.structural_alerts is not None):
            raise ValueError("Structural-alert availability differs from the requested policy.")
        if row.structural_alerts is not None:
            entries = [(alert.catalogue, alert.rule) for alert in row.structural_alerts]
            if len(entries) != len(set(entries)) or any(
                name not in permitted for name, _ in entries
            ):
                raise ValueError("Structural-alert catalogue/identity is inconsistent.")
            if options.alert_policy == "exclude" and entries and row.eligible:
                raise ValueError(
                    "A rule-matched molecule cannot pass an explicit exclusion policy."
                )
        if row.reason_code == "structural_alert" and (
            options.alert_policy != "exclude" or not row.structural_alerts or row.eligible
        ):
            raise ValueError("Structural-alert exclusion requires real matched-rule evidence.")
    if options.mode != "scaffold":
        if (
            result.scaffold_groups is not None
            or result.scaffold_method is not None
            or any(row.scaffold_group is not None for row in result.rows)
        ):
            raise ValueError("Scaffold grouping was not requested.")
        return
    if result.scaffold_groups is None or result.scaffold_method != "murcko_chiral_acyclic_exact":
        raise ValueError("Scaffold selection requires its actual grouping method and records.")
    groups = result.scaffold_groups
    if [group.index for group in groups] != list(range(len(groups))) or len(
        {(group.kind, group.smiles) for group in groups}
    ) != len(groups):
        raise ValueError("Scaffold groups must have unique ordered chemical identities.")
    memberships = {}
    for group in groups:
        selected = 0
        for record in group.records:
            if record >= len(result.rows) or record in memberships:
                raise ValueError("Scaffold membership must refer to one original record.")
            memberships[record] = group.index
            row = result.rows[record]
            if (
                not row.available
                or row.descriptors.fragments != 1
                or row.scaffold_group != group.index
            ):
                raise ValueError("Scaffold membership differs from the original molecule evidence.")
            selected += row.selected
        if selected > options.per_scaffold:
            raise ValueError("Scaffold output exceeds the selected per-family budget.")
    for row in result.rows:
        expected = row.available and row.descriptors.fragments == 1
        if expected != (row.record in memberships) or row.scaffold_group != memberships.get(
            row.record
        ):
            raise ValueError("Every supported original molecule needs exact scaffold membership.")
        if row.reason_code == "multiple_fragments" and (
            not row.available or row.descriptors.fragments == 1 or row.eligible
        ):
            raise ValueError("Multiple-fragment exclusion evidence is inconsistent.")
        if row.available and row.descriptors.fragments != 1 and row.eligible:
            raise ValueError("A multi-fragment molecule cannot be selected as one scaffold.")
        if row.reason_code == "scaffold_quota":
            group = groups[row.scaffold_group] if row.scaffold_group is not None else None
            if (
                row.eligible
                or group is None
                or sum(result.rows[r].selected for r in group.records) < options.per_scaffold
            ):
                raise ValueError(
                    "Scaffold quota exclusion requires enough selected representatives."
                )
