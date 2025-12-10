from typing import TypedDict
import geopandas
from shapely import LineString, MultiLineString

from find_orphan_lines import find_orphan_lines

class LinesToEdgesResult(TypedDict):
    edges: geopandas.GeoDataFrame
    orphans: geopandas.GeoDataFrame


def lines_to_edges(lines: geopandas.GeoDataFrame, no_orphans: bool = True) -> LinesToEdgesResult:
    """
    Given a GeoDataFrame of line geometries, split lines at their intersection points.
    Returns a new GeoDataFrame with the split lines.
    """

    # create a union of all lines
    print('  Finding intersections and splitting lines...')
    all_lines_union = lines.union_all()
    if not isinstance(all_lines_union, (LineString, MultiLineString)):
        raise ValueError(
            'Union of lines did not result in LineString or MultiLineString geometry.')

    # if the union is a LineString, that means there was only one line in lines
    if isinstance(all_lines_union, LineString):
        # convert to MultiLineString for consistency
        all_lines_union = MultiLineString([all_lines_union])

    # detect orphan lines
    print('  Detecting orphan lines...')
    orphans_list = find_orphan_lines(all_lines_union)
    if orphans_list:
        if no_orphans:
            raise ValueError(
                f'    Found {len(orphans_list)} orphan lines. Cannot proceed with splitting at intersections.')
        else:
            print(
                f'    Warning: Found {len(orphans_list)} orphan lines. Orphan lines indicate connectivity issues in the input data.')

    # extract each individual line from the unioned geometry
    print('  Exploding split lines...')
    split_lines = []
    for geom in all_lines_union.geoms:
        if isinstance(geom, LineString):
            split_lines.append(geom)
    edges = geopandas.GeoDataFrame(geometry=split_lines, crs=lines.crs)

    # buffer the original lines slightly
    print('  Associating attributes from original lines to edges...')
    print('    Copying lines')
    lines_buffered = lines.copy()
    print('    Buffering lines slightly to ensure proper spatial join')
    lines_buffered.geometry = lines_buffered.geometry.buffer(0.01)

    # apply columns from lines to edges based on whether it is within the buffered lines
    print('    Performing spatial join to assign attributes to edges')
    edges = edges.sjoin(lines_buffered, how='left', predicate='within')
    try:
        edges = edges.drop(columns=['index_right'])
    except KeyError:
        pass  # index_right column does not exist

    # generate ids for each final edge
    print('  Generating edge IDs...')
    edges['edge_id'] = edges.index
    edges.set_index('edge_id', inplace=True)
    
    # convert orphans to geodataframe
    print('  Separating orphans...')
    orphans = geopandas.GeoDataFrame(geometry=orphans_list, crs=lines.crs)

    return {
        'edges': edges,
        'orphans': orphans
    }
