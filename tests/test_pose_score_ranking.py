"""Pure native-evidence ordering tests; no docking/affinity inference is claimed."""

import pytest

from opendde_workbench.docking.result import Score
from opendde_workbench.pose_ensembles.ranking import ScoreCandidate, rank_native_scores


def candidate(index, empirical, cnn=None, condition="a" * 64):
    scores = [Score(name="minimizedAffinity", value=empirical, unit="kcal/mol", direction="lower")]
    if cnn is not None:
        scores.append(Score(name="CNNscore", value=cnn, unit="model_output", direction="higher"))
    return ScoreCandidate((f"pose_{index // 100 + 1:03d}", index % 100), condition, tuple(scores))


def test_actual_score_directions_ties_and_tradeoffs():
    # Synthetic scalar evidence isolates the sorting algorithm; actual native
    # fixture/API/browser integration is a separate acceptance requirement.
    rows = (
        candidate(0, -8, 0.3),
        candidate(1, -7, 0.8),
        candidate(2, -6, 0.2),
        candidate(3, -8, 0.3),
    )
    result = rank_native_scores(rows, ("minimizedAffinity", "CNNscore"))
    assert [v.front for v in result] == [1, 1, 2, 1]
    assert [v.key for v in result] == [v.key for v in rows]
    assert [v.front for v in rank_native_scores(rows, ("minimizedAffinity",))] == [1, 2, 3, 1]
    assert [v.front for v in rank_native_scores(rows, ("CNNscore",))] == [2, 1, 3, 2]


def test_different_conditions_and_missing_scores_never_get_false_global_rank():
    rows = (candidate(0, -10, 0.8), candidate(1, -5, 0.2, "b" * 64), candidate(2, -20))
    result = rank_native_scores(rows, ("minimizedAffinity", "CNNscore"))
    assert [v.front for v in result] == [1, 1, None]
    assert result[2].missing_metrics == ("CNNscore",)
    assert rows[2].scores[0].value == -20


def test_explicit_selection_metric_and_work_bounds():
    row = candidate(0, -5)
    for rows, metrics in (
        ((), ("minimizedAffinity",)),
        ((row, row), ("minimizedAffinity",)),
        ((row,), ()),
        ((row,), ("inventedAffinity",)),
        ((row,), ("minimizedAffinity", "minimizedAffinity")),
    ):
        with pytest.raises(ValueError):
            rank_native_scores(rows, metrics)
    with pytest.raises(ValueError, match="256"):
        rank_native_scores(tuple(candidate(i, -i) for i in range(257)), ("minimizedAffinity",))
    result = rank_native_scores(tuple(candidate(i, -i) for i in range(256)), ("minimizedAffinity",))
    assert len(result) == 256 and result[-1].front == 1 and result[0].front == 256


def test_comparison_boundary_rejects_unknown_metrics_duplicate_or_invalid_selectors():
    from uuid import uuid4

    from pydantic import ValidationError

    from opendde_workbench.pose_ensembles.score_contracts import ScoreComparisonInput

    body = {"pose_set_id": str(uuid4()), "selections": [{"step_id": "pose_000", "record": 0}]}
    assert ScoreComparisonInput.model_validate(body).metrics == ("minimizedAffinity",)
    for changed in (
        {**body, "metrics": ["fakeTotalAffinity"]},
        {**body, "selections": body["selections"] * 2},
        {**body, "selections": [{"step_id": "pose_000", "record": True}]},
        {**body, "selections": [{"step_id": "pose_000", "record": 100}]},
        {**body, "scores": [{"name": "minimizedAffinity", "value": -100}]},
    ):
        with pytest.raises(ValidationError):
            ScoreComparisonInput.model_validate(changed)
