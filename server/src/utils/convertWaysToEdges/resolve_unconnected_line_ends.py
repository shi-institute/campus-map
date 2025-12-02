import geopandas
from shapely import LineString, MultiLineString, Point

from get_line_termini import get_line_termini


def resolve_unconnected_line_ends(lines: geopandas.GeoDataFrame, distance_threshold: float = 1.0, overshoot: float = 0.0) -> geopandas.GeoDataFrame:
    """
    Given a GeoDataFrame of line geometries, identify unconnected line ends and attempt to connect them
    to the nearest line within a certain threshold distance.
    
    Parameters:
    - lines: GeoDataFrame containing LineString geometries.
    - distance_threshold: Maximum distance within which to search for a line to connect to.
    - overshoot: Additional distance to extend beyond the nearest line when connecting.
    """
    lines_spatial_index = lines.sindex

    # find all terminal nodes
    terminal_nodes = get_line_termini(lines)

    # find the closest line for each terminal node within the distance threshold that is not the node
    # from which it originates, and then extend the terminus to the closest line
    extended_lines = lines.copy()
    for index, node in terminal_nodes.iterrows():

        # find candidate lines within the distance threshold
        candidates_indices = list(lines_spatial_index.query(
            node.geometry, predicate='dwithin', distance=distance_threshold, sort=True))
        candidates = lines.iloc[candidates_indices]

        # exclude candidates that are the same as the node's line
        candidates = candidates[candidates.index != node.line_index]
        if not isinstance(candidates, geopandas.GeoDataFrame) or candidates.empty:
            continue

        # calculate the distance between the node and each candidate line
        candidates['distance'] = candidates.geometry.apply(
            lambda geom: node.geometry.distance(geom))

        # sort by distance (ascending; closest first)
        candidates = candidates.sort_values(by='distance', ascending=True)

        # if there is not a candidate, skip further processing
        if candidates.empty:
            continue
        best_candidate = candidates.iloc[0]

        # ensure the best candidate is a LineString or MultiLineString
        if not isinstance(best_candidate.geometry, (LineString, MultiLineString)):
            continue

        # find the closest point on the candidate line to the terminal node
        terminal_point = node.geometry
        distance_along_candidate_line_to_closest_point = best_candidate.geometry.project(
            terminal_point)
        closest_point_on_candidate_line = best_candidate.geometry.interpolate(
            distance_along_candidate_line_to_closest_point)

        # verify that the existing line is a LineString
        existing_line = extended_lines.loc[node.line_index].geometry
        if not isinstance(existing_line, LineString):
            continue
        
        # compute a vector from the existing line terminus to the closest point on the candidate line
        extension_vector_origin = Point(existing_line.coords[0]) if (node.type == 'start') else Point(existing_line.coords[-1])
        extension_vector = (
            closest_point_on_candidate_line.x - extension_vector_origin.x,
            closest_point_on_candidate_line.y - extension_vector_origin.y
        )
            
        # compute the magnitude (length) and unit vector
        extension_vector_magnitude = (extension_vector[0]**2 + extension_vector[1]**2)**0.5
        if extension_vector_magnitude == 0:
            continue  # cannot extend if the vector magnitude is zero
        extension_unit_vector = (
            extension_vector[0] / extension_vector_magnitude,
            extension_vector[1] / extension_vector_magnitude
        )
        
        # compute the extension point, applying overshoot if specified
        overshoot_vector = ( # will be (0, 0) if overshoot is 0
            extension_unit_vector[0] * overshoot,
            extension_unit_vector[1] * overshoot
        )
        extension_point = Point(
            closest_point_on_candidate_line.x + overshoot_vector[0],
            closest_point_on_candidate_line.y + overshoot_vector[1]
        )

        # create a new line that extends the existing line to the closest point on the candidate way
        new_line: LineString
        if (node.type == 'start'):
            new_line = LineString([extension_point] + list(existing_line.coords))
        else:  # node.type == 'end'
            new_line = LineString(list(existing_line.coords) + [extension_point])

        # update the way geometry
        extended_lines.at[node.line_index, 'geometry'] = new_line  # type: ignore[assignment]

    return extended_lines
