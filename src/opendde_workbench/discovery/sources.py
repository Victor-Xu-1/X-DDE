"""Actual reviewed Open Targets, UniProt and ChEMBL protocol queries."""

import re
from urllib.parse import urlencode

from .transport import SourceUnavailable, fetch

ENDPOINT = "https://api.platform.opentargets.org/api/v4/graphql"
SEARCH = """query($text:String!,$entities:[String!]!) {
 search(queryString:$text,entityNames:$entities,page:{index:0,size:10}) {
 total hits {id name entity description} } }"""
TARGET = """query($id:String!,$size:Int!) { target(ensemblId:$id) {
 id approvedSymbol approvedName biotype proteinIds {id source}
 tractability {label modality value}
 associatedDiseases(page:{index:0,size:$size}) {count rows {disease {id name} score}} } }"""
DISEASE = """query($id:String!,$size:Int!) { disease(efoId:$id) {
 id name associatedTargets(page:{index:0,size:$size}) {
 count rows {target {id approvedSymbol approvedName} score}} } }"""


def graphql(query, variables):
    value, receipt = fetch(ENDPOINT, {"query": query, "variables": variables})
    if value.get("errors") or not isinstance(value.get("data"), dict):
        raise SourceUnavailable("Open Targets query failed; the schema or service needs review.")
    return value["data"], receipt


def lookup(entity, text):
    data, receipt = graphql(SEARCH, {"text": text, "entities": [entity]})
    receipt.pop("raw_document", None)
    result = data.get("search")
    if not isinstance(result, dict) or not isinstance(result.get("hits"), list):
        raise SourceUnavailable("Open Targets search response is invalid.")
    hits = []
    for item in result["hits"][:10]:
        if not isinstance(item, dict) or item.get("entity") != entity:
            raise SourceUnavailable("Search returned a mismatched entity.")
        if not all(isinstance(item.get(key), str) for key in ("id", "name")):
            raise SourceUnavailable("Search returned an invalid identifier.")
        hits.append({key: item.get(key) for key in ("id", "name", "entity", "description")})
    return {
        "hits": hits,
        "total": result.get("total"),
        "source": "Open Targets",
        "receipt": receipt,
    }


def evidence(entity, identifier, limit):
    data, receipt = graphql(
        TARGET if entity == "target" else DISEASE, {"id": identifier, "size": limit}
    )
    item = data.get(entity)
    if item is None:
        raise ValueError("This selected identifier no longer exists in Open Targets; search again.")
    if not isinstance(item, dict) or item.get("id") != identifier:
        raise SourceUnavailable("Evidence identifier does not match the requested entity.")
    return item, receipt


def protein(accession):
    if not re.fullmatch(r"[A-Z0-9]{6,10}", accession):
        raise ValueError("Invalid reviewed UniProt accession.")
    value, receipt = fetch("https://rest.uniprot.org/uniprotkb/" + accession + ".json")
    if value.get("primaryAccession") != accession:
        raise SourceUnavailable("UniProt returned a different primary accession; review mapping.")
    return value, receipt


def activities(accession, limit):
    query = urlencode(
        {"target_components__accession": accession, "target_type": "SINGLE PROTEIN", "limit": 5}
    )
    targets, target_receipt = fetch("https://www.ebi.ac.uk/chembl/api/data/target.json?" + query)
    rows = targets.get("targets")
    if not isinstance(rows, list):
        raise SourceUnavailable("ChEMBL returned an invalid target response.")
    # Do not pool protein-family/complex or nonhuman measurements with this human gene.
    eligible = [
        row
        for row in rows
        if row.get("organism") == "Homo sapiens" and row.get("target_type") == "SINGLE PROTEIN"
    ]
    if len(eligible) != 1:
        return {
            "status": "ambiguous" if eligible else "empty",
            "targets": eligible,
            "rows": [],
            "total": None,
        }, [target_receipt]
    selected = eligible[0]["target_chembl_id"]
    if not re.fullmatch(r"CHEMBL[0-9]+", selected):
        raise SourceUnavailable("ChEMBL target identifier is invalid.")
    query = urlencode(
        {
            "target_chembl_id": selected,
            "limit": limit,
            "offset": 0,
            "standard_type__in": "IC50,EC50,Ki,Kd",
            "order_by": "activity_id",
        }
    )
    value, receipt = fetch("https://www.ebi.ac.uk/chembl/api/data/activity.json?" + query)
    if not isinstance(value.get("activities"), list):
        raise SourceUnavailable("ChEMBL returned an invalid activity response.")
    return {
        "status": "ok" if value["activities"] else "empty",
        "target": selected,
        "rows": value["activities"][:limit],
        "total": value.get("page_meta", {}).get("total_count"),
    }, [target_receipt, receipt]
