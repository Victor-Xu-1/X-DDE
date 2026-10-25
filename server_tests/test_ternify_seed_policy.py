"""Real fork-worker state and input boundaries for the candidate execution policy."""

import random
import tempfile
import unittest
from pathlib import Path

from ternify_seed_policy import SeededPhases


def sample(_):
    return [random.random() for _ in range(4)]


class NativeSeedPolicyTests(unittest.TestCase):
    def test_equal_root_seeds_reproduce_each_native_worker_phase(self):
        with tempfile.TemporaryDirectory() as folder:
            policy = SeededPhases([31, 31, 137], Path(folder) / "phases")
            results = []
            for _ in range(6):
                with policy(1) as pool:
                    results.append(pool.map(sample, [None])[0])
            self.assertEqual(results[:2], results[2:4])
            self.assertNotEqual(results[:2], results[4:])
            self.assertEqual(len(policy.proof()), 6)

    def test_unknown_parallelism_or_missing_phases_cannot_claim_reproducibility(self):
        with tempfile.TemporaryDirectory() as folder:
            policy = SeededPhases([31], Path(folder) / "phases")
            with self.assertRaisesRegex(ValueError, "exactly one"):
                with policy(2):
                    self.fail("An unreviewed worker count must not start.")
            with self.assertRaisesRegex(ValueError, "skipped"):
                policy.proof()


if __name__ == "__main__":
    unittest.main()
