"""Native namespace identity is shared by creation and attach; unsafe names never run."""

from uuid import uuid4

import pytest

from opendde_workbench.managed_containers import attached_container, container_name


@pytest.mark.parametrize(
    "identifier", ["p2rank", "gnina", "chemistry", "biopython", "anarcii", "posebusters"]
)
def test_registered_creation_and_attachment_use_same_job_identity(identifier):
    job_id = str(uuid4())
    assert attached_container("xdde-" + identifier + "-", job_id) == container_name(
        identifier, job_id
    )
    if identifier in {"chemistry", "biopython", "anarcii", "posebusters"}:
        assert container_name(identifier, job_id, preparation=True) == attached_container(
            "xdde-" + identifier + "-", job_id
        )
    else:
        with pytest.raises(ValueError, match="namespace"):
            container_name(identifier, job_id, preparation=True)


@pytest.mark.parametrize(
    "prefix", ["unowned-", "anarcii-", "xdde-unknown-", "xdde-anarcii", "xdde-anarcii--"]
)
def test_unregistered_container_cannot_be_attached(tmp_path, monkeypatch, prefix):
    from opendde_workbench.container_supervision import attach

    def unexpected(*args, **kwargs):
        raise AssertionError("Unsafe namespace reached an external process")

    monkeypatch.setattr("opendde_workbench.container_supervision.subprocess.run", unexpected)
    directory = tmp_path / str(uuid4())
    with pytest.raises(ValueError):
        attach(directory, prefix)
