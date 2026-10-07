"""One stable CSV export contract for verified original-frame channel measurements."""

import csv
import io

SUMMARY = (
    "cluster",
    "tunnel",
    "bottleneck_radius_angstrom",
    "length_angstrom",
    "curvature",
    "geometric_throughput",
    "geometric_cost",
)
POINTS = (
    "cluster",
    "tunnel",
    "point",
    "x_angstrom",
    "y_angstrom",
    "z_angstrom",
    "radius_angstrom",
    "sample_polyline_distance_angstrom",
    "native_profile_distance_angstrom",
    "radius_error_bound_angstrom",
)


def render_exports(rows):
    summary, points = io.StringIO(newline=""), io.StringIO(newline="")
    table, profile = csv.writer(summary), csv.writer(points)
    table.writerow(SUMMARY)
    profile.writerow(POINTS)
    for row in rows:
        table.writerow(
            [
                row["cluster"],
                row["tunnel"],
                row["bottleneck_radius_angstrom"],
                row["length_angstrom"],
                row["curvature"],
                row["native_geometric_throughput"],
                row["native_geometric_cost"],
            ]
        )
        for index, point in enumerate(row["points"]):
            profile.writerow(
                [
                    row["cluster"],
                    row["tunnel"],
                    index,
                    *point["position"],
                    point["radius_angstrom"],
                    point["sample_polyline_distance_angstrom"],
                    point["native_profile_distance_angstrom"],
                    point["radius_error_bound_angstrom"],
                ]
            )
    return {
        "channels.csv": summary.getvalue().encode("utf-8"),
        "channel-points.csv": points.getvalue().encode("utf-8"),
    }


def write_exports(rows, output):
    for name, content in render_exports(rows).items():
        (output / name).write_bytes(content)
