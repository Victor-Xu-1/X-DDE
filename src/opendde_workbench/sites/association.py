"""Bounded evidence-only graph: never pair pockets by rank or force a bijection."""

import math
from itertools import combinations

from .contracts import SiteEvidence, SiteGroup, SiteRelation


def associate(ensemble, observations, options):
    sites = []
    observation_by_member = {o.member_index: o for o in observations}
    for observation in observations:
        member = ensemble.members[observation.member_index]
        if member.evidence.transformation is None:
            raise ValueError("Site comparison requires an actual qualified residue correspondence.")
        mapping = {p.moving: p.reference for p in member.evidence.transformation.residue_pairs}
        for pocket in observation.pockets:
            addresses = {(r.chain, r.number, r.insertion_code) for r in pocket.residues}
            lookup = {(k.chain, k.number, k.insertion_code): v for k, v in mapping.items()}
            mapped = tuple(
                sorted(
                    {lookup[a] for a in addresses if a in lookup},
                    key=lambda a: (a.chain, a.number, a.insertion_code),
                )
            )
            coverage = len(mapped) / len(addresses) if addresses else 0
            sites.append(
                SiteEvidence(
                    id=f"m{observation.member_index:02}-p{pocket.rank}",
                    member_index=observation.member_index,
                    native=pocket,
                    mapped_residues=mapped,
                    mapping_coverage=coverage,
                    mapping_status="sufficient"
                    if mapped and coverage >= options.minimum_mapping_coverage
                    else "insufficient",
                    center=(pocket.center_x, pocket.center_y, pocket.center_z),
                )
            )
    if len(sites) > 256 or sum(len(s.native.residues) for s in sites) > 20000:
        raise ValueError(
            "Site comparison exceeds 256 sites or 20000 residue observations. "
            "Reduce the reviewed pocket count and create new pocket tasks."
        )
    relations = []
    adjacency = {s.id: set() for s in sites}
    uncertain = set()
    for left, right in combinations(sites, 2):
        if left.member_index == right.member_index:
            continue
        distance = math.dist(left.center, right.center)
        if not math.isfinite(distance):
            raise ValueError("Aligned pocket centers exceed the finite distance domain.")
        a, b = set(left.mapped_residues), set(right.mapped_residues)
        shared = len(a & b)
        jaccard = shared / len(a | b) if a or b else 0
        reasons = []
        if left.mapping_status != "sufficient" or right.mapping_status != "sufficient":
            reasons.append("insufficient_mapping")
        lo, ro = observation_by_member[left.member_index], observation_by_member[right.member_index]
        if (lo.method, lo.software_version, lo.profile, lo.point_threshold, lo.minimum_cluster) != (
            ro.method,
            ro.software_version,
            ro.profile,
            ro.point_threshold,
            ro.minimum_cluster,
        ):
            reasons.append("different_prediction_settings")
        if reasons:
            status = "uncertain"
            uncertain.update((left.id, right.id))
        else:
            if distance > options.maximum_center_distance:
                reasons.append("center_distance")
            if jaccard < options.minimum_jaccard:
                reasons.append("residue_overlap")
            if shared < options.minimum_shared_residues:
                reasons.append("shared_residue_count")
            status = "not_associated" if reasons else "associated"
        relations.append(
            SiteRelation(
                left=left.id,
                right=right.id,
                center_distance=distance,
                shared_residues=shared,
                residue_jaccard=jaccard,
                status=status,
                reasons=tuple(reasons),
            )
        )
        if status == "associated":
            adjacency[left.id].add(right.id)
            adjacency[right.id].add(left.id)
    # Connected components preserve split/merge ambiguity and are not identity equivalence.
    by_id = {s.id: s for s in sites}
    remaining = set(by_id)
    groups = []
    observed_members = set(observation_by_member)
    while remaining:
        start = min(remaining)
        pending, component = [start], set()
        while pending:
            current = pending.pop()
            if current in component:
                continue
            component.add(current)
            pending.extend(adjacency[current] - component)
        remaining -= component
        members = [by_id[i].member_index for i in component]
        if len(component) > 1:
            # Non-cliques also retain transitive, non-equivalent associations as ambiguous.
            clique = all(b in adjacency[a] for a, b in combinations(sorted(component), 2))
            status = "associated" if len(set(members)) == len(members) and clique else "ambiguous"
        else:
            observation = observation_by_member[members[0]]
            incomplete = any(
                o.truncated or not o.pockets
                for o in observations
                if o.member_index != observation.member_index
            )
            status = (
                "uncertain"
                if start in uncertain or incomplete or (by_id[start].mapping_status != "sufficient")
                else "unmatched"
            )
        groups.append(
            SiteGroup(
                id=f"site-group-{len(groups) + 1}",
                sites=tuple(sorted(component)),
                status=status,
                missing_observed_members=tuple(sorted(observed_members - set(members))),
            )
        )
    return tuple(sites), tuple(relations), tuple(groups)
