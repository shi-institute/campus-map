from typing import TypedDict
import geopandas
from shapely import LineString, MultiLineString
from shapely.ops import split

from find_orphan_lines import find_orphan_lines

class LinesToEdgesResult(TypedDict):
    edges: geopandas.GeoDataFrame
    orphans: geopandas.GeoDataFrame


def lines_to_edges(lines: geopandas.GeoDataFrame, no_orphans: bool = True, *, additional_split_polygons: geopandas.GeoDataFrame | None = None) -> LinesToEdgesResult:
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

    # split the unioned lines by any additional polygons that are provided
    if additional_split_polygons is not None and not additional_split_polygons.empty:
        # require valid geometries
        additional_split_polygons = additional_split_polygons[additional_split_polygons.is_valid &
                                                              ~additional_split_polygons.is_empty &
                                                              additional_split_polygons.geometry.notna()]
        
        # require onlt polygons
        if not all(additional_split_polygons.geometry.type.isin(['Polygon', 'MultiPolygon'])):
            found_types = additional_split_polygons.geometry.type.unique()
            raise ValueError(f'All geometries in the input ways GeoDataFrame must be Polygon or MultiPolygon types. Found geometry types: {found_types}')
        
        print('  Splitting lines by additional polygons...')
        polygons_union = additional_split_polygons.union_all()
        if not polygons_union.is_empty:
            all_lines_union = split(all_lines_union, polygons_union)

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
