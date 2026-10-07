"""Read the exact CAVER 3.02 CSV protocol with finite, bounded native geometry."""

import csv
import math
from itertools import pairwise

HEADER = (
    "Snapshot",
    "Tunnel cluster",
    "Tunnel",
    "Throughput",
    "Cost",
    "Bottleneck radius",
    "Average R error bound",
    "Max. R error bound",
    "Bottleneck R error bound",
    "Curvature",
    "Length",
    "",
    "Axis",
    "Values...",
)
AXES = {"X", "Y", "Z", "distance", "length", "R", "Upper limit of R overestimation"}


def number(value, *, unknown=False):
    if unknown and value.strip() == "-":
        return None
    value = float(value)
    if not math.isfinite(value):
        raise ValueError("Native channel measurements must be finite.")
    return value


def positive_integer(value):
    text = value.strip()
    if not text.isascii() or not text.isdecimal() or not 1 <= int(text) <= 10000:
        raise ValueError("Invalid native tunnel identifier.")
    return int(text)


def read_characteristics(file, snapshot, maximum_tunnels):
    if file.is_symlink() or not file.is_file() or file.stat().st_size > 4 * 1024**2:
        raise ValueError("Native channel summaries exceed the owned file budget.")
    expected = (
        "Snapshot",
        "Tunnel cluster",
        "Tunnel",
        "Throughput",
        "Cost",
        "Bottleneck radius",
        "Bottleneck R error bound",
        "Length",
        "Curvature",
    )
    result = {}
    with file.open(newline="", encoding="utf-8-sig") as stream:
        rows = csv.reader(stream)
        if tuple(v.strip() for v in next(rows, ())) != expected:
            raise ValueError("Native channel summary protocol changed.")
        for row in rows:
            if len(row) != 9 or row[0].strip() != snapshot:
                raise ValueError("Native channel summary belongs to another structure.")
            key = (positive_integer(row[1]), positive_integer(row[2]))
            if key in result or len(result) >= maximum_tunnels:
                raise ValueError("Native channel summaries are duplicated or exceed budget.")
            result[key] = tuple(
                number(row[index], unknown=index == 6) for index in (3, 4, 5, 6, 7, 8)
            )
    return result


def read_profiles(file, snapshot, *, maximum_tunnels=500, maximum_points=250000):
    if file.is_symlink() or not file.is_file() or file.stat().st_size > 32 * 1024**2:
        raise ValueError("Native channel profiles exceed the owned 32 MiB file budget.")
    summaries = read_characteristics(
        file.with_name("tunnel_characteristics.csv"), snapshot, maximum_tunnels
    )
    values, count = {}, 0
    with file.open(newline="", encoding="utf-8-sig") as stream:
        rows = csv.reader(stream)
        if tuple(value.strip() for value in next(rows, ())) != HEADER:
            raise ValueError("Native channel profiles do not match the reviewed CAVER protocol.")
        for row in rows:
            if len(row) < 15 or row[0].strip() != snapshot or row[11].strip():
                raise ValueError(
                    "Native channel profile belongs to another structure or is malformed."
                )
            key = (positive_integer(row[1]), positive_integer(row[2]))
            axis = row[12].strip()
            if axis not in AXES:
                raise ValueError("Unknown native channel profile axis.")
            metadata = tuple(v.strip() for v in row[:12])
            if key not in values:
                if len(values) >= maximum_tunnels:
                    raise ValueError("Native tunnel count exceeded the declared analysis budget.")
                values[key] = {"metadata": metadata, "axes": {}}
            item = values[key]
            if metadata != item["metadata"] or axis in item["axes"]:
                raise ValueError("Duplicated or inconsistent native tunnel profile.")
            points = [
                number(v, unknown=axis == "Upper limit of R overestimation") for v in row[13:]
            ]
            if not 2 <= len(points) <= 10000:
                raise ValueError("Native channel sampling must contain 2–10000 points.")
            count += len(points)
            if count > maximum_points * 7:
                raise ValueError("Native channel profile exceeded the total point budget.")
            item["axes"][axis] = points
    if set(values) != set(summaries):
        raise ValueError(
            "Native channel profiles and complete-path summaries have different coverage."
        )
    result = []
    for (cluster, tunnel), item in sorted(values.items()):
        axes, metadata = item["axes"], item["metadata"]
        if set(axes) != AXES or len({len(v) for v in axes.values()}) != 1:
            raise ValueError("Native channel coordinate/radius profiles are incomplete.")
        throughput, cost, bottleneck, curvature, length = (
            number(metadata[index]) for index in (3, 4, 5, 9, 10)
        )
        if (
            not 0 <= throughput <= 1
            or cost < 0
            or bottleneck <= 0
            or length <= 0
            or curvature < 1 - 1e-6
            or abs(throughput - math.exp(-cost)) > 1e-8
        ):
            raise ValueError("Native channel summary is outside its method definition.")
        if any(v <= 0 for v in axes["R"]) or any(v < 0 for v in axes["distance"] + axes["length"]):
            raise ValueError("Native radius and distances cannot be negative.")
        if any(right < left for left, right in pairwise(axes["length"])):
            raise ValueError("Native channel arc length must be ordered.")
        complete = (
            throughput,
            cost,
            bottleneck,
            number(metadata[8], unknown=True),
            length,
            curvature,
        )
        if complete != summaries[(cluster, tunnel)]:
            raise ValueError("Native profile summary differs from the complete-path report.")
        coordinates = list(zip(axes["X"], axes["Y"], axes["Z"], strict=True))
        sample_arc = [0.0]
        for left, right in pairwise(coordinates):
            sample_arc.append(sample_arc[-1] + math.dist(left, right))
        if any(v is not None and v < 0 for v in axes["Upper limit of R overestimation"]):
            raise ValueError("Native point radius error bounds cannot be negative.")
        errors = [number(metadata[index], unknown=True) for index in (6, 7, 8)]
        if any(v is not None and v < 0 for v in errors):
            raise ValueError("Native radius error bounds cannot be negative.")
        result.append(
            {
                "cluster": cluster,
                "tunnel": tunnel,
                "bottleneck_radius_angstrom": bottleneck,
                "length_angstrom": length,
                "curvature": curvature,
                "native_geometric_throughput": throughput,
                "native_geometric_cost": cost,
                "radius_error_bounds_angstrom": errors,
                "points": [
                    {
                        "position": list(position),
                        "radius_angstrom": radius,
                        "native_profile_distance_angstrom": arc,
                        "sample_polyline_distance_angstrom": polyline,
                        "distance_from_start_angstrom": distance,
                        "radius_error_bound_angstrom": error,
                    }
                    for position, radius, arc, distance, error, polyline in zip(
                        coordinates,
                        axes["R"],
                        axes["length"],
                        axes["distance"],
                        axes["Upper limit of R overestimation"],
                        sample_arc,
                        strict=True,
                    )
                ],
            }
        )
    return result
