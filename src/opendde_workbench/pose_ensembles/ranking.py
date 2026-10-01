"""Bounded native-score Pareto fronts within explicitly equal computation conditions.

This is comparison of existing evidence, not a new scientific inference method.
Units are not normalized and unrelated condition groups never share a front.
"""

from collections import defaultdict
from dataclasses import dataclass
from typing import get_args

from ..docking.result import Score

SCORE_NAMES = get_args(Score.model_fields["name"].annotation)
MAX_COMPARISON_POSES = 256


@dataclass(frozen=True)
class ScoreCandidate:
    key: tuple[str, int]
    condition_sha256: str
    scores: tuple[Score, ...]


@dataclass(frozen=True)
class RankedCandidate:
    key: tuple[str, int]
    condition_sha256: str
    front: int | None
    missing_metrics: tuple[str, ...] = ()


def _fronts(vectors: list[tuple[float, ...]]) -> list[int]:
    # Each unordered pair is visited once. Directed dominance edges give every
    # front in O(n^2 * metrics), rather than repeatedly sorting/peeling subsets.
    size = len(vectors)
    edges = [[] for _ in range(size)]
    incoming = [0] * size
    for a in range(size):
        for b in range(a + 1, size):
            av, bv = vectors[a], vectors[b]
            if all(x <= y for x, y in zip(av, bv, strict=True)) and any(
                x < y for x, y in zip(av, bv, strict=True)
            ):
                edges[a].append(b)
                incoming[b] += 1
            elif all(y <= x for x, y in zip(av, bv, strict=True)) and any(
                y < x for x, y in zip(av, bv, strict=True)
            ):
                edges[b].append(a)
                incoming[a] += 1
    pending = [i for i, count in enumerate(incoming) if count == 0]
    result = [0] * size
    front = 1
    while pending:
        following = []
        for index in pending:
            result[index] = front
            for target in edges[index]:
                incoming[target] -= 1
                if incoming[target] == 0:
                    following.append(target)
        pending = following
        front += 1
    if any(value == 0 for value in result):
        raise ValueError("Native-score dominance graph is inconsistent.")
    return result


def rank_native_scores(
    candidates: tuple[ScoreCandidate, ...], metrics: tuple[str, ...]
) -> tuple[RankedCandidate, ...]:
    """Return every selected key, with missing-score entries explicitly unranked.

    condition_sha256 must be compiled by the platform from frozen task inputs,
    chemical identity, native method and options; it is never a client-provided
    claim that two arbitrary structures/scores are comparable.
    """
    if not 1 <= len(candidates) <= MAX_COMPARISON_POSES:
        raise ValueError("Select between 1 and 256 poses; no silent truncation is applied.")
    if (
        not 1 <= len(metrics) <= 3
        or len(set(metrics)) != len(metrics)
        or any(name not in SCORE_NAMES for name in metrics)
    ):
        raise ValueError("Choose distinct native score names for this comparison.")
    keys = [item.key for item in candidates]
    if len(set(keys)) != len(keys):
        raise ValueError("A pose can only appear once in the selected comparison.")
    groups: dict[str, list[tuple[ScoreCandidate, tuple[float, ...]]]] = defaultdict(list)
    results: dict[tuple[str, int], RankedCandidate] = {}
    for item in candidates:
        if len(item.condition_sha256) != 64 or any(
            c not in "0123456789abcdef" for c in item.condition_sha256
        ):
            raise ValueError("Native score comparison requires a frozen condition digest.")
        if len({score.name for score in item.scores}) != len(item.scores):
            raise ValueError("A native score name occurs more than once.")
        values = {score.name: score for score in item.scores}
        missing = tuple(name for name in metrics if name not in values)
        if missing:
            results[item.key] = RankedCandidate(item.key, item.condition_sha256, None, missing)
            continue
        vector = tuple(
            values[name].value if values[name].direction == "lower" else -values[name].value
            for name in metrics
        )
        groups[item.condition_sha256].append((item, vector))
    for group in groups.values():
        for (item, _), front in zip(group, _fronts([v for _, v in group]), strict=True):
            results[item.key] = RankedCandidate(item.key, item.condition_sha256, front)
    return tuple(results[key] for key in keys)
