"""Association behavior uses explicit controlled evidence, never fake inference."""

from types import SimpleNamespace
from uuid import uuid4

import pytest

from opendde_workbench.receptors.selection import ResidueAddress, ResiduePair
from opendde_workbench.scientific_objects import MoleculeRef, ResidueRef
from opendde_workbench.sites.association import associate
from opendde_workbench.sites.contracts import NativeSite, SiteInput, SiteObservation, SiteOptions


def evidence(ranks=(1, 7), centers=(0, 1), residue_sets=((1, 2, 3), (1, 2, 3))):
    members, observations = [], []
    for index in range(len(ranks)):
        ref = MoleculeRef(asset_id=uuid4(), sha256=str(index + 1) * 64, version_id=uuid4())
        pairs = tuple(
            ResiduePair(
                reference=ResidueAddress(chain="A", number=n),
                moving=ResidueAddress(chain="B" if index else "A", number=n + index * 100),
            )
            for n in range(1, 6)
        )
        members.append(
            SimpleNamespace(
                evidence=SimpleNamespace(transformation=SimpleNamespace(residue_pairs=pairs))
            )
        )
        chain = "B" if index else "A"
        sites = (
            NativeSite(
                rank=ranks[index],
                name="controlled candidate",
                score=1,
                probability=0.5,
                center_x=centers[index],
                center_y=0,
                center_z=0,
                residues=tuple(
                    ResidueRef(structure=ref, chain=chain, number=n + index * 100)
                    for n in residue_sets[index]
                ),
            ),
        )
        observations.append(
            SiteObservation(
                member_index=index,
                protein=ref,
                source_job=uuid4(),
                report_sha256="a" * 64,
                native_predictions_sha256="b" * 64,
                native_residues_sha256="c" * 64,
                method="P2Rank",
                software_version="2.5.1",
                protein_artifact="protein.pdb",
                profile="experimental",
                point_threshold=0.4,
                minimum_cluster=3,
                native_pocket_count=1,
                truncated=False,
                pockets=sites,
            )
        )
    return SimpleNamespace(members=members), tuple(observations)


def test_association_uses_mapped_residues_and_distance_not_rank():
    ensemble, observations = evidence()
    sites, relations, groups = associate(ensemble, observations, SiteOptions())
    assert sites[1].native.rank == 7 and relations[0].residue_jaccard == 1
    assert relations[0].center_distance == 1 and groups[0].status == "associated"
    ensemble, observations = evidence(ranks=(1, 1), centers=(0, 20))
    _, relations, groups = associate(ensemble, observations, SiteOptions())
    assert relations[0].status == "not_associated" and len(groups) == 2
    assert all(g.status == "unmatched" for g in groups)


def test_unmapped_settings_empty_and_truncated_evidence_cannot_claim_disappearance():
    ensemble, observations = evidence(residue_sets=((1, 2, 3), (50, 51, 52)))
    _, relations, groups = associate(ensemble, observations, SiteOptions())
    assert relations[0].status == "uncertain"
    assert relations[0].reasons == ("insufficient_mapping",)
    assert all(g.status == "uncertain" for g in groups)
    ensemble, observations = evidence()
    for change in ({"profile": "predicted"}, {"point_threshold": 0.8}):
        changed = (observations[0], observations[1].model_copy(update=change))
        assert associate(ensemble, changed, SiteOptions())[1][0].reasons == (
            "different_prediction_settings",
        )
    for change in ({"pockets": (), "native_pocket_count": 0}, {"pockets": (), "truncated": True}):
        changed = (observations[0], observations[1].model_copy(update=change))
        _, relations, groups = associate(ensemble, changed, SiteOptions())
        assert not relations and groups[0].status == "uncertain"


def test_split_merge_and_nontransitive_components_remain_ambiguous():
    ensemble, observations = evidence()
    second = observations[1]
    extra = second.pockets[0].model_copy(update={"rank": 9})
    observations = (
        observations[0],
        second.model_copy(update={"pockets": second.pockets + (extra,), "native_pocket_count": 2}),
    )
    _, relations, groups = associate(ensemble, observations, SiteOptions())
    assert len(relations) == 2 and len(groups) == 1 and groups[0].status == "ambiguous"
    ensemble, observations = evidence(ranks=(1, 2, 3), centers=(0, 7, 14))
    _, relations, groups = associate(ensemble, observations, SiteOptions())
    assert len(groups) == 1 and groups[0].status == "ambiguous"
    assert sum(r.status == "associated" for r in relations) == 2


def test_input_budgets_and_csrf_failure_paths(client_factory):
    with pytest.raises(ValueError):
        SiteInput(ensemble_id=uuid4(), pocket_jobs=(uuid4(),))
    key = uuid4()
    with pytest.raises(ValueError):
        SiteInput(ensemble_id=uuid4(), pocket_jobs=(key, key))
    with pytest.raises(ValueError):
        SiteOptions(minimum_jaccard=float("nan"))
    with client_factory() as client:
        body = {"ensemble_id": str(uuid4()), "pocket_jobs": [str(uuid4()), str(uuid4())]}
        headers = {"Idempotency-Key": str(uuid4())}
        assert (
            client.post(
                "/api/research/site-sets", json=body, headers={**headers, "X-Workbench-CSRF": "bad"}
            ).status_code
            == 403
        )
        assert client.post("/api/research/site-sets", json=body, headers=headers).status_code == 422
        assert client.get("/api/research/site-sets").json() == []
        assert client.get("/api/research/site-sets/" + str(uuid4())).status_code == 404
