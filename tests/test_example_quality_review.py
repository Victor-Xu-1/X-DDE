"""Historical quality reviews must not turn unassessed native flags into passes."""

import hashlib
from types import SimpleNamespace
from uuid import UUID, uuid4

from opendde_workbench.examples.contracts import ExamplePin, ExampleReview
from opendde_workbench.examples.quality_review import quality_review
from opendde_workbench.examples.review_corrections import correct_review


def sample(tmp_path):
    job_id = uuid4()
    root = tmp_path / "jobs" / str(job_id) / "output"
    root.mkdir(parents=True)
    raw = b'{}'
    (root / "result.json").write_bytes(raw)
    review = ExampleReview(
        interpretation="All native flags were reported as passing.",
        limitations="This does not establish binding affinity.",
        checked=("input_identity", "method_scope", "native_outputs", "visual_preview", "downloads"),
    )
    pin = ExamplePin(
        capability_id="posebusters.check", case_id="example", revision=3,
        job_id=job_id, request_sha256="a" * 64, environment_sha256="b" * 64,
        artifact_sha256={"result.json": hashlib.sha256(raw).hexdigest()},
        created_at="2026-10-28T00:00:00Z", review=review,
    )
    job = SimpleNamespace(status="succeeded", request=SimpleNamespace(operation="pose_quality"))
    store = SimpleNamespace(get=lambda _: job)
    return pin, store, root


def test_projection_preserves_the_recorded_review_and_reports_missingness(tmp_path, monkeypatch):
    pin, store, root = sample(tmp_path)
    result = SimpleNamespace(
        inputs={"protein": object()}, metrics={"smallest_distance_protein": 2.8,
            "number_double_bonds_checked": 0},
        checks=[SimpleNamespace(id="minimum_distance_to_protein", outcome="pass"),
            SimpleNamespace(id="minimum_distance_to_waters", outcome="pass"),
            SimpleNamespace(id="double_bond_flatness", outcome="pass"),
            SimpleNamespace(id="bond_lengths", outcome="fail")],
    )
    monkeypatch.setattr(
        "opendde_workbench.examples.quality_review.validate_quality", lambda *_: result
    )
    shown, original = quality_review(pin, store, tmp_path)
    assert (
        "1 checks passed, 1 failed, 1 were not assessed or unavailable, "
        "and 1 were not applicable" in shown.review.interpretation
    )
    assert "1 项通过，1 项未通过，1 项未评估或不可用，1 项不适用" in shown.review.interpretation
    assert shown.review.limitations == pin.review.limitations
    assert original == pin.review
    assert "All native flags" in pin.review.interpretation
    assert (root / "result.json").read_bytes() == b'{}'


def test_changed_source_cannot_be_presented_as_a_verified_review(tmp_path, monkeypatch):
    pin, store, root = sample(tmp_path)
    (root / "result.json").write_bytes(b'{"changed":true}')
    def must_not_validate(*_):
        raise AssertionError("changed bytes must not be validated")
    monkeypatch.setattr(
        "opendde_workbench.examples.quality_review.validate_quality", must_not_validate
    )
    shown, original = quality_review(pin, store, tmp_path)
    assert "could not be verified" in shown.review.interpretation
    assert original == pin.review


def test_missing_review_or_missing_pin_does_not_invent_one(tmp_path):
    pin, store, _ = sample(tmp_path)
    assert quality_review(None, store, tmp_path) == (None, None)
    empty = pin.model_copy(update={"review": None})
    assert quality_review(empty, store, tmp_path) == (empty, None)


def test_example_api_exposes_projected_review_and_preserves_recorded_text(
    settings, client_factory, monkeypatch
):
    pin, _, _ = sample(settings.state_dir)
    projected = pin.model_copy(
        update={
            "review": pin.review.model_copy(update={"interpretation": "Evidence-derived review."})
        }
    )
    monkeypatch.setattr(
        "opendde_workbench.examples.routes.ExamplePins.get", lambda *_args, **_kwargs: pin
    )
    monkeypatch.setattr(
        "opendde_workbench.examples.routes.ExampleRecords.get", lambda *_args, **_kwargs: None
    )
    monkeypatch.setattr(
        "opendde_workbench.examples.routes.quality_review",
        lambda *_args: (projected, pin.review),
    )
    with client_factory() as client:
        response = client.get("/api/examples/posebusters.check?profile=stat6")
    assert response.status_code == 200
    body = response.json()
    assert body["pin"]["review"]["interpretation"] == "Evidence-derived review."
    assert body["recorded_review"]["interpretation"] == pin.review.interpretation


def test_historical_minimization_correction_is_bound_to_exact_source(tmp_path):
    pin, _, _ = sample(tmp_path)
    review = pin.review.model_copy(update={
        "interpretation": (
            "Minimization retained the original geometry. "
            "Independent PoseBusters 0.6.5 assessment passes the same "
            "22 applicable geometry checks."
        )
    })
    source = pin.model_copy(update={
        "capability_id": "gnina.minimize", "revision": 3,
        "job_id": UUID("22ccf2fe-cbcb-43aa-9852-af267c85b678"),
        "artifact_sha256": {
            "result.json": "7bae030d010dbb5e2091413462bb55103f891a6ba19f285d8b73a95b216e4c51"
        },
        "review": review,
    })
    shown, recorded = correct_review(source)
    assert "cannot be verified from the retained evidence" in shown.review.interpretation
    assert "原案例所述的 22 项适用质控未关联独立报告" in shown.review.interpretation
    assert "Minimization retained the original geometry." in shown.review.interpretation
    assert "passes the same 22 applicable" not in shown.review.interpretation
    assert recorded == review
    assert source.review == review
    other = source.model_copy(update={"artifact_sha256": {"result.json": "0" * 64}})
    assert correct_review(other) == (other, None)
    changed_review = review.model_copy(update={"interpretation": "Another retained review."})
    changed = source.model_copy(update={"review": changed_review})
    assert "could not be verified" in correct_review(changed)[0].review.interpretation


def test_minimization_example_api_keeps_recorded_review(settings, client_factory, monkeypatch):
    pin, _, _ = sample(settings.state_dir)
    review = pin.review.model_copy(update={
        "interpretation": (
            "Independent PoseBusters 0.6.5 assessment passes the same "
            "22 applicable geometry checks."
        )
    })
    source = pin.model_copy(update={
        "capability_id": "gnina.minimize", "revision": 3,
        "job_id": UUID("22ccf2fe-cbcb-43aa-9852-af267c85b678"),
        "artifact_sha256": {
            "result.json": "7bae030d010dbb5e2091413462bb55103f891a6ba19f285d8b73a95b216e4c51"
        },
        "review": review,
    })
    monkeypatch.setattr(
        "opendde_workbench.examples.routes.ExamplePins.get", lambda *_args, **_kwargs: source
    )
    monkeypatch.setattr(
        "opendde_workbench.examples.routes.ExampleRecords.get", lambda *_args, **_kwargs: None
    )
    with client_factory() as client:
        response = client.get("/api/examples/gnina.minimize?profile=stat6")
    assert response.status_code == 200
    body = response.json()
    assert "cannot be verified" in body["pin"]["review"]["interpretation"]
    assert body["recorded_review"]["interpretation"] == review.interpretation
