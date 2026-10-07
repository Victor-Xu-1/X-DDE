"""A coordinate-independent V2000 signature used by native and platform verification."""


def graph_signature(lines):
    if len(lines) < 5 or "V2000" not in lines[3]:
        raise ValueError("A complete V2000 molecular record is required.")
    count, bonds = int(lines[3][:3]), int(lines[3][3:6])
    if not 3 <= count <= 256 or not 1 <= bonds <= 1024 or len(lines) < 4 + count + bonds:
        raise ValueError("The complete molecular graph exceeds its reviewed bounds.")
    connections = []
    for line in lines[4 + count : 4 + count + bonds]:
        a, b, order = int(line[:3]) - 1, int(line[3:6]) - 1, int(line[6:9])
        if a == b or not 0 <= a < count or not 0 <= b < count or not 1 <= order <= 4:
            raise ValueError("A complete molecular bond is invalid.")
        connections.append((min(a, b), max(a, b), order))
    if len({row[:2] for row in connections}) != bonds:
        raise ValueError("The complete molecular graph has duplicate bonds.")
    return {
        "atoms": [line[31:39] for line in lines[4 : 4 + count]],
        "bonds": sorted(connections),
        "annotations": sorted(
            line.rstrip()
            for line in lines[4 + count + bonds :]
            if line.startswith(("M  CHG", "M  ISO", "M  RAD"))
        ),
    }
