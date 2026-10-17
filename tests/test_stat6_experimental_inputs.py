"""Real reported STAT6 inputs must not inherit an unreported experimental organism."""

import csv
import io

from test_stat6_templates import scientific_store

from opendde_workbench.examples.stat6.catalogue import verified_input
from opendde_workbench.examples.stat6.preparation import prepare_stat6
from opendde_workbench.research.evidence_contracts import EvidenceInput
from opendde_workbench.research.evidence_records import EvidenceRecords


def test_reported_stat6_draft_preserves_unknown_conditions_original_values_and_all_links(tmp_path):
    store, scientific = scientific_store(tmp_path)
    prepared = prepare_stat6("experimental.evidence", scientific)
    draft = EvidenceInput.model_validate(prepared.evidence_draft)
    source = scientific.assets.get(draft.source.asset_id)
    original = scientific.assets.path(source).read_bytes()
    rows = list(csv.DictReader(io.StringIO(original.decode())))
    assert original == verified_input("stat6_measurements")
    assert draft.conditions.target == "STAT6 activation (ChEMBL5401; homologous assignment)"
    assert draft.conditions.assay == "CHEMBL982109" and draft.conditions.species == ""
    assert draft.conditions.temperature_c is None and draft.conditions.ph is None
    assert draft.conditions.method == "FW4 cellular reporter assay"
    assert "organism not reported" in draft.citation and "confidence 8" in draft.citation
    guide = prepared.study["guide"]
    assert len(guide["steps"]) == 4 and "38" in guide["steps"][2][1]
    assert "unknown information blank" in guide["steps"][1][1]
    assert "direct binding affinities" in guide["interpretation"][1]
    assert "unbound conformer" not in guide["interpretation"][1]
    records = EvidenceRecords(store, scientific.assets)
    observations = records.preview(draft)
    assert len(observations) == len(rows) == len(draft.compound_links) == 38
    for index, (observation, row) in enumerate(zip(observations, rows, strict=True)):
        assert observation.compound == row["compound"]
        assert observation.reported_value == row["value"]
        assert observation.relation == row["relation"]
        assert observation.conditions == draft.conditions
        assert observation.molecule == draft.compound_links[row["compound"]]
        assert observation.molecule.record == index
        scientific.validate_reference(observation.molecule)
    repeated = EvidenceInput.model_validate(
        prepare_stat6("experimental.evidence", scientific).evidence_draft
    )
    assert repeated.model_dump_json() == draft.model_dump_json()
    assert scientific.assets.path(source).read_bytes() == original
    assert store.list_jobs() == []
    with store.connect() as db:
        assert db.execute("SELECT count(*) FROM research_evidence").fetchone()[0] == 0
