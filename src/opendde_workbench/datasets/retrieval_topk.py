"""Exact blockwise ranking with stable tie ordering; no full-library score allocation."""

import heapq

import numpy as np


def fold_scores(vectors, query):
    vectors = np.asarray(vectors, dtype=np.float32)
    query = np.asarray(query, dtype=np.float32)
    if vectors.ndim != 2 or vectors.shape[1] != 768 or query.shape != (6, 128):
        raise ValueError("The selected index and query must use the same six 128D folds.")
    if not np.isfinite(vectors).all() or not np.isfinite(query).all():
        raise ValueError("Incomplete or nonfinite native embedding data cannot be ranked.")
    return np.einsum("nfd,fd->nf", vectors.reshape(-1, 6, 128), query, optimize=True)


def calibration(scores):
    if len(scores) < 2:
        raise ValueError(
            "At least two independent indexed members are required for fold calibration."
        )
    mean, deviation = np.mean(scores, axis=0), np.std(scores, axis=0)
    if np.any(deviation <= 1e-8):
        raise ValueError(
            "This index has insufficient score variation for fold Z-score calibration."
        )
    return mean, deviation


class TopK:
    def __init__(self, maximum):
        self.maximum, self.heap = maximum, []

    def add(self, scores, raw_scores, library, start):
        if len(scores) != len(raw_scores) or not np.isfinite(scores).all():
            raise ValueError("Native ranking scores are invalid.")
        # Each block contributes at most K; stable ties prefer earlier library/row identities.
        if len(scores) <= self.maximum:
            local = np.arange(len(scores))
        else:
            threshold = np.partition(scores, len(scores) - self.maximum)[-self.maximum]
            better = np.flatnonzero(scores > threshold)
            ties = np.flatnonzero(scores == threshold)[: self.maximum - len(better)]
            local = np.concatenate((better, ties))
        for offset in local:
            row = start + int(offset)
            item = (float(scores[offset]), -library, -row, float(raw_scores[offset]))
            if len(self.heap) < self.maximum:
                heapq.heappush(self.heap, item)
            elif item[:3] > self.heap[0][:3]:
                heapq.heapreplace(self.heap, item)

    def rows(self):
        return [
            (score, raw, -library, -row)
            for score, library, row, raw in sorted(
                self.heap, key=lambda item: item[:3], reverse=True
            )
        ]
