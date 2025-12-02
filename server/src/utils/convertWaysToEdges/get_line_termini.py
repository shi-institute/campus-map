import geopandas
from shapely import LineString, MultiLineString, Point


def get_line_termini(lines: geopandas.GeoDataFrame) -> geopandas.GeoDataFrame:
    """
    Given a GeoDataFrame of line geometries, return a GeoDataFrame of their terminal points (start and end).
    Each terminal point will have attributes indicating whether it is a start or end point, and the index of the line to which it belongs.
    """

    def get_first_last(geom):
        if isinstance(geom, LineString):
            coords = list(geom.coords)
        elif isinstance(geom, MultiLineString):
            coords = list(geom.geoms[0].coords)
        else:
            return (None, None)
        return Point(coords[0]), Point(coords[-1])

    terminal_nodes_list = []
    for line_index, (start, end) in lines["geometry"].apply(get_first_last).items():
        terminal_nodes_list.append({'geometry': start, 'line_index': line_index, 'type': 'start'})
        terminal_nodes_list.append({'geometry': end, 'line_index': line_index, 'type': 'end'})
    terminal_nodes = geopandas.GeoDataFrame(
        terminal_nodes_list, geometry='geometry', crs=lines.crs)
    return terminal_nodes
