from collections import Counter

from shapely import LineString, MultiLineString


def find_orphan_lines(multiline: MultiLineString) -> list[LineString]:
    lines = list(multiline.geoms)
    endpoints = []

    # collect start and end points of all lines
    for line in lines:
        coords = list(line.coords)
        endpoints.append(coords[0])
        endpoints.append(coords[-1])

    # count occurrences of each endpoint
    counts = Counter(endpoints)

    # any endpoint that appears only once is isolated
    isolated_lines: list[LineString] = []
    for line in lines:
        coords = list(line.coords)
        if counts[coords[0]] == 1 and counts[coords[-1]] == 1:
            isolated_lines.append(line)

    return isolated_lines
