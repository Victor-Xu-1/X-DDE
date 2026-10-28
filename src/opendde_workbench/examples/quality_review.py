"""Project historical quality reviews from verified native evidence without editing pins."""

import hashlib
import json
from collections import Counter

from ..artifacts import contained
from ..quality.assessment import assess_checks
from ..quality.result import validate_quality


def quality_review(pin, store, state):
    """Return an evidence-derived review and the unmodified recorded review."""
    if pin is None or pin.review is None:
        return pin, None
    original = pin.review
    try:
        job = store.get(str(pin.job_id))
        if job is None or job.status != "succeeded" or job.request.operation != "pose_quality":
            raise ValueError("Quality source is unavailable.")
        root = state / "jobs" / str(pin.job_id) / "output"
        report = contained(root, "result.json")
        if report.stat().st_size > 4 * 1024**2:
            raise ValueError("Quality report exceeds its display budget.")
        raw = report.read_bytes()
        if hashlib.sha256(raw).hexdigest() != pin.artifact_sha256.get("result.json"):
            raise ValueError("Quality result no longer matches the fixed example.")
        result = validate_quality(json.loads(raw), job.request, root)
        counts = Counter(row["assessment"] for row in assess_checks(result))
        missing = counts["unassessed"] + counts["unavailable"]
        interpretation = (
            "Evidence-derived correction to the recorded example review: "
            f"{counts['pass']} checks passed, {counts['fail']} failed, "
            f"{missing} were not assessed or unavailable, and "
            f"{counts['not_applicable']} were not applicable. "
            "Native flags and the recorded review are preserved; "
            "see the detailed quality results.\n\n"
            "根据已核验的原始结果修正案例解读："
            f"{counts['pass']} 项通过，{counts['fail']} 项未通过，"
            f"{missing} 项未评估或不可用，{counts['not_applicable']} 项不适用。"
            "原始报告及原案例解读均予保留，具体项目请查看质控结果。"
        )
    except (OSError, ValueError, TypeError, KeyError, IndexError):
        interpretation = (
            "The fixed quality evidence could not be verified. Its recorded interpretation "
            "is retained for audit but must not be treated as a verified result.\n\n"
            "无法核验该固定质控证据；原解读保留供追溯，不应视为已核验结果。"
        )
    projected = original.model_copy(update={"interpretation": interpretation})
    return pin.model_copy(update={"review": projected}), original
