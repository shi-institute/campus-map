import geopandas
import pandas
from shapely import LineString, MultiLineString, Point

from get_line_termini import get_line_termini


def resolve_unconnected_line_ends(lines: geopandas.GeoDataFrame, distance_threshold: float = 1.0, overshoot: float = 0.0, *, polygons: geopandas.GeoDataFrame | None = None) -> geopandas.GeoDataFrame:
    """
    Given a GeoDataFrame of line geometries, identify unconnected line ends and attempt to connect them
    to the nearest line within a certain threshold distance.

    If polygons are specified, unconnected line ends will be extended to the nearest line or polygon edge.

    Parameters:
    - lines: GeoDataFrame containing LineString geometries.
    - distance_threshold: Maximum distance within which to search for a line to connect to.
    - overshoot: Additional distance to extend beyond the nearest line when connecting.
    - polygons (optional): GeoDataFrame containing Polygon geometries.
    """
    lines_spatial_index = lines.sindex
    polygons_spatial_index = polygons.sindex if polygons is not None else None

    # find all terminal nodes
    terminal_nodes = get_line_termini(lines)

    # find the closest line for each terminal node within the distance threshold that is not the node
    # from which it originates, and then extend the terminus to the closest line
    extended_lines = lines.copy()
    for index, node in terminal_nodes.iterrows():

        # find candidate lines within the distance threshold
        candidate_lines_indices = list(lines_spatial_index.query(
            node.geometry, predicate='dwithin', distance=distance_threshold, sort=True))
        candidate_lines = lines.iloc[candidate_lines_indices]

        # exclude candidate lines that are the same as the node's line
        candidate_lines = candidate_lines[candidate_lines.index != node.line_index]
        if not isinstance(candidate_lines, geopandas.GeoDataFrame) or candidate_lines.empty:
            candidate_lines = geopandas.GeoDataFrame(columns=lines.columns, crs=lines.crs)

        # calculate the distance between the node and each candidate line
        candidate_lines['distance'] = candidate_lines.geometry.apply(
            lambda geom: node.geometry.distance(geom))

        # sort by distance (ascending; closest first)
        candidate_lines = candidate_lines.sort_values(by='distance', ascending=True)

        # skip if there is a candidate with distance 0
        if not candidate_lines.empty and candidate_lines.iloc[0]['distance'] == 0:
            continue

        # if there are no candidate lines AND polygons are provided, also consider polygons
        candidate_polygons: None | geopandas.GeoDataFrame = None
        if candidate_lines.empty and polygons is not None and not polygons.empty and polygons_spatial_index is not None:

            # find candidate polygons within the distance threshold
            candidate_polygons_indices = list(polygons_spatial_index.query(
                node.geometry, predicate='dwithin', distance=distance_threshold, sort=True))
            candidate_polygons = polygons.iloc[candidate_polygons_indices]

            # calculate the distance between the node and each candidate polygon
            candidate_polygons['distance'] = candidate_polygons.geometry.apply(
                lambda geom: node.geometry.distance(geom))

            # sort by distance (ascending; closest first)
            candidate_polygons = candidate_polygons.sort_values(by='distance', ascending=True)

            # convert polygons to lines (exterior boundaries)
            candidate_lines = geopandas.GeoDataFrame(
                geometry=candidate_polygons.geometry.boundary,
                index=candidate_polygons.index,
                crs=polygons.crs
            )

        # if there is not a candidate, skip further processing
        if candidate_lines.empty:
            continue
        best_candidate = candidate_lines.iloc[0]

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
        extension_vector_origin = Point(existing_line.coords[0]) if (
            node.type == 'start') else Point(existing_line.coords[-1])
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
        overshoot_vector = (  # will be (0, 0) if overshoot is 0
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

    # get the outlines of the polygons
    polygon_outlines: None | geopandas.GeoDataFrame = None
    if polygons is not None and not polygons.empty:
        polygon_outlines = geopandas.GeoDataFrame(
            geometry=polygons.geometry.boundary,
            index=polygons.index,
            crs=polygons.crs
        )

    return extended_lines
