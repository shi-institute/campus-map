from shapely.geometry import LineString, MultiLineString, Point
from shapely.geometry.base import GeometrySequence
from shapely.ops import substring


def trace_boundary_part(boundaries: GeometrySequence[MultiLineString], start_point: Point, end_point: Point, *, prefer_shortest: bool = True) -> LineString | MultiLineString | None:
    """
    Trace a boundary part from start_point to end_point within the given boundaries.

    Args:
        boundaries (GeometrySequence[MultiLineString]): A sequence of MultiLineString geometries representing boundaries.
        start_point (Point): The starting point for tracing.
        end_point (Point): The ending point for tracing.
        prefer_shortest (bool, optional): If True, prefer the shortest path. Defaults to True.

    Returns:
        MultiLineString: The traced boundary part as a MultiLineString.
    """
    # find the polygon boundary that includes both points
    poly_boundary: LineString | None = None
    for boundary in boundaries:
        if not isinstance(boundary, LineString):
            continue
        if start_point.within(boundary.buffer(0.000001)) and end_point.within(boundary.buffer(0.000001)):
            poly_boundary = boundary
            break
    if poly_boundary is None:
        return

    # compute the distances along the boundary to each point
    distance_along_boundary_to_start_point = poly_boundary.project(start_point)
    distance_along_boundary_to_end_point = poly_boundary.project(end_point)

    # compute the lengths of both possible paths
    forward_length = (distance_along_boundary_to_end_point -
                      distance_along_boundary_to_start_point) % poly_boundary.length
    reverse_length = poly_boundary.length - forward_length

    # resolve the correct distances for tracing based on preferences
    forward_is_shorter = forward_length <= reverse_length
    print(forward_is_shorter, prefer_shortest)
    start_dist: float
    end_dist: float
    if prefer_shortest and forward_is_shorter:
        start_dist = distance_along_boundary_to_start_point
        end_dist = distance_along_boundary_to_end_point
    elif prefer_shortest and not forward_is_shorter:
        start_dist = distance_along_boundary_to_end_point
        end_dist = distance_along_boundary_to_start_point
    elif not prefer_shortest and forward_is_shorter:
        start_dist = distance_along_boundary_to_end_point
        end_dist = distance_along_boundary_to_start_point
    else:  # not prefer_shortest and not forward_is_shorter
        start_dist = distance_along_boundary_to_start_point
        end_dist = distance_along_boundary_to_end_point

    # handle case where the segment to trace is fully contained within
    # the polygon's starting and ending points
    if start_dist <= end_dist:
        boundary_segment = substring(
            poly_boundary,
            start_dist,
            end_dist,
            normalized=False,
        )

    # handle case where the segment to trace crosses the boundary start/end point
    else:
        boundary_segment_part1 = substring(
            poly_boundary,
            start_dist,
            poly_boundary.length,
            normalized=False,
        )
        boundary_segment_part2 = substring(
            poly_boundary,
            0,
            end_dist,
            normalized=False,
        )
        boundary_segment = boundary_segment_part1.union(boundary_segment_part2)

    if isinstance(boundary_segment, LineString):
        return boundary_segment
    elif isinstance(boundary_segment, MultiLineString):
        return boundary_segment
    return None
