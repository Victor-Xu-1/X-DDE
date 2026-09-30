"""Bounded ancestry traversal; graph data shares the existing database authority."""

from uuid import UUID

from .graph_records import TABLES, project_record

MAX_NODES, MAX_DEPTH, BATCH = 3000, 32, 200


def parse_focus(focus):
    try:
        kind, value = focus.split(":", 1)
        if kind not in TABLES:
            raise ValueError()
        return kind, str(UUID(value))
    except (ValueError, AttributeError) as exc:
        raise KeyError("Scientific relationship node does not exist.") from exc


def graph(store, *, limit=200, focus=None):
    nodes, edges, attempted = {}, set(), set()
    truncated = False

    def add(kind, row):
        nonlocal truncated
        identifier = kind + ":" + row["id"]
        if identifier in nodes:
            return
        if len(nodes) >= MAX_NODES:
            truncated = True
            return
        identifier, node, relations = project_record(store, kind, row)
        nodes[identifier] = node
        edges.update(relations)

    with store.connect() as db:
        for kind, table in TABLES.items():
            rows = db.execute(
                f"SELECT * FROM {table} ORDER BY created_at DESC,id LIMIT ?", (limit + 1,)
            ).fetchall()
            truncated |= len(rows) > limit
            for row in rows[:limit]:
                add(kind, row)
        if focus:
            kind, value = parse_focus(focus)
            row = db.execute(f"SELECT * FROM {TABLES[kind]} WHERE id=?", (value,)).fetchone()
            if row is None:
                raise KeyError("Scientific relationship node does not exist.")
            add(kind, row)
            # Decoded typed requests establish edges; LIKE only retrieves candidate consumers.
            rows = db.execute(
                "SELECT * FROM jobs WHERE request LIKE ? ORDER BY created_at DESC,id LIMIT ?",
                ("%" + value + "%", limit + 1),
            ).fetchall()
            truncated |= len(rows) > limit
            for row in rows[:limit]:
                add("task", row)
            rows = db.execute(
                "SELECT * FROM scientific_objects WHERE asset_id=? OR "
                "json_extract(body,'$.parent_id')=? OR json_extract(body,'$.source_job')=? "
                "ORDER BY created_at DESC,id LIMIT ?",
                (value, value, value, limit + 1),
            ).fetchall()
            truncated |= len(rows) > limit
            for row in rows[:limit]:
                add("object", row)
        for _ in range(MAX_DEPTH):
            missing = {part for edge in edges for part in edge[:2]} - nodes.keys() - attempted
            if not missing:
                break
            for kind, table in TABLES.items():
                values = sorted(
                    part.split(":", 1)[1] for part in missing if part.startswith(kind + ":")
                )
                for start in range(0, len(values), BATCH):
                    batch = values[start : start + BATCH]
                    placeholders = ",".join("?" for _ in batch)
                    for row in db.execute(
                        f"SELECT * FROM {table} WHERE id IN ({placeholders})", batch
                    ).fetchall():
                        add(kind, row)
            attempted.update(missing)
            if len(nodes) >= MAX_NODES:
                truncated = True
                break
        else:
            truncated = True
    valid = [(a, b, relation) for a, b, relation in edges if a in nodes and b in nodes]
    if focus:
        connected = {focus}
        for source, target, _ in valid:
            if focus in (source, target):
                connected.update((source, target))
        nodes = {key: value for key, value in nodes.items() if key in connected}
        valid = [(a, b, relation) for a, b, relation in valid if a in nodes and b in nodes]
    return {
        "schema": 1,
        "nodes": list(nodes.values()),
        "edges": [
            {"source": a, "target": b, "relation": relation} for a, b, relation in sorted(valid)
        ],
        "truncated": bool(truncated),
        "limit": limit,
    }
