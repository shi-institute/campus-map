from pathlib import Path
from typing import TypedDict

import geopandas
from shapely import make_valid
from shapely.validation import explain_validity

from find_orphan_lines import find_orphan_lines
from get_line_termini import get_line_termini
from lines_to_edges import lines_to_edges
from resolve_unconnected_line_ends import resolve_unconnected_line_ends


class EdgesResult(TypedDict):
    edges: geopandas.GeoDataFrame
    nodes: geopandas.GeoDataFrame
    orphans: geopandas.GeoDataFrame


def convert_ways_to_edges(ways: geopandas.GeoDataFrame | Path, connection_tolerance: float, min_edge_length: float, no_orphans: bool, intermediate_crs: str) -> EdgesResult:
    """
    Given a GeoDataFrame of way geometries, convert them to edges by splitting at intersections.
    Returns a new GeoDataFrame with the edges.
    """
    # if a path was provided instead, read it to a GeoDataFrame
    if isinstance(ways, Path):
        if (not ways.exists()) or (not ways.is_file()):
            raise FileNotFoundError(f'Ways file not found: {ways}')
        
        # parquet file
        if ways.suffix == '.parquet':
            ways = geopandas.read_parquet(ways)
        
        # any other file type supported by geopandas
        else:
            ways = geopandas.read_file(ways)
            
    # reproject to intermediate CRS for processing
    old_crs = ways.crs
    if not old_crs:
        raise ValueError('Input ways GeoDataFrame has no CRS defined.')
    ways = ways.to_crs(intermediate_crs)
    
    # check for invalid geometries
    print('Checking for invalid geometries...')
    invalid_mask = ~ways.is_valid | ways.is_empty | ways.geometry.isna()
    invalid_count = invalid_mask.sum()
    if invalid_count > 0:
        print(f"  Found {invalid_count} invalid or empty geometries.")
        
        print("  Reasons for invalid geometries:")
        reasons = ways.geometry[invalid_mask].apply(explain_validity)
        for reason, count in reasons.value_counts().items():
            print(f"    {reason}: {count}")
        
        print("  Attempting repair with make_valid...")
        ways["geometry"] = ways.geometry.apply(
            lambda g: make_valid(g) if g is not None else None
        )

        # drop any geometry that still fails after repair
        pre_drop_count = len(ways)
        ways = ways[ways.geometry.notnull() & ways.is_valid & ~ways.is_empty].copy()
        dropped_count = pre_drop_count - len(ways)

        print(f"  Dropped {dropped_count} geometries that could not be repaired.")
        print(f"  {len(ways)} geometries remain after cleaning.")
    
    # only allow lines
    if not all(ways.geometry.type.isin(['LineString', 'MultiLineString'])):
        found_types = ways.geometry.type.unique()
        raise ValueError(f'All geometries in the input ways GeoDataFrame must be LineString or MultiLineString types. Found geometry types: {found_types}')
    
    # explode MultiLineStrings to LineStrings
    print('Exploding MultiLineStrings to LineStrings...')
    ways = ways.explode(index_parts=False).reset_index(drop=True)

    # ----------------------------------------
    # create edges:
    
    # step 1: split at intersections
    print('[e1] Splitting ways at intersections...')
    initial_lines_to_edges_result = lines_to_edges(ways, no_orphans)
    initial_edges = initial_lines_to_edges_result['edges']
    
    # step 2: remove all lines that are shorter than the minimum edge length
    print(f'[e2] Removing edges shorter than minimum edge length of {min_edge_length}...')
    filtered_edges = geopandas.GeoDataFrame(initial_edges[initial_edges.geometry.length >= min_edge_length], crs=initial_edges.crs)
    print(f'Removed {len(initial_edges) - len(filtered_edges)} edges shorter than minimum edge length of {min_edge_length}.')
    
    # step 3: connect edges that are within the connection tolerance, specifying an overshoot
    #         distance so that we can split at intersections again
    print(f'[e3] Connecting unconnected line ends within tolerance of {connection_tolerance}...')
    connected_edges = resolve_unconnected_line_ends(filtered_edges, connection_tolerance, overshoot=0.000001)
    
    # step 4: split any remaining lines at intersections again (to catch new intersections created by connections)
    print('[e4] Splitting connected lines at intersections again...')
    final_lines_to_edges_result = lines_to_edges(connected_edges, no_orphans)
    edges_with_small_extensions = final_lines_to_edges_result['edges']
    orphans = final_lines_to_edges_result['orphans']
        
    # step 5. remove the leftover short edges again
    print(f'[e5] Removing edges shorter than minimum edge length of {min_edge_length} again...')
    edges = geopandas.GeoDataFrame(edges_with_small_extensions[edges_with_small_extensions.geometry.length > 0.000001], crs=connected_edges.crs)

    # ----------------------------------------

    # create nodes (includes duplicates)
    print('Creating nodes from edge termini...')
    nodes = get_line_termini(edges)

    # consolidate by geometry to remove duplicates, but keep track of all associated edge_ids
    print('Consolidating nodes to remove duplicates...')
    nodes['geometry_wkt'] = nodes.geometry.apply(lambda geom: geom.wkt)
    nodes.drop(columns=['type'], inplace=True)
    nodes = nodes.dissolve(by='geometry_wkt', as_index=False, aggfunc=lambda x: list(x))
    nodes.drop(columns=['geometry_wkt'], inplace=True)
    nodes.rename(columns={'edge_id': 'edges'}, inplace=True)
    nodes['node_id'] = nodes.index
    nodes.set_index('node_id', inplace=True)

    return {
        'edges': edges.to_crs(old_crs),
        'nodes': nodes.to_crs(old_crs),
        'orphans': orphans.to_crs(old_crs)
    }
