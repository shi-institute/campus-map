import path from 'path';
import { exec } from '../exec.js';

/**
 * Converts an input geospatial file containing 'ways' into 'edges' suitable for routing.
 *
 * The input and output types may be any format supported by GeoPandas (e.g., GeoPackage, Parquet, etc.).
 *
 * The connection tolerance is specified in the units of the input data's coordinate reference system (CRS).
 *
 * @param waysPath - The file path to the input 'ways' geospatial data.
 * @param edgesPath - The file path where the output 'edges' geospatial data will be saved.
 * @param connectionTolerance - The distance tolerance for connecting nodes (default is 5 units).
 * @param allowOrphans - Whether to allow orphaned nodes (default is false).
 * @param intermediateCrs - The intermediate CRS to use for processing (default is 'EPSG:3857'). Use a project coordinate system for best results.
 */
export async function convertWaysToEdges(
  waysPath: string,
  edgesPath: string,
  connectionTolerance = 3.2,
  minimumEdgeLength = 1.6,
  allowOrphans = false,
  intermediateCrs = 'EPSG:3857'
) {
  const outputExtension = path.extname(edgesPath).toLowerCase();
  const nodesPath =
    path.dirname(edgesPath) + '/' + path.basename(edgesPath, outputExtension) + '_vertices' + outputExtension;
  const orphansPath =
    path.dirname(edgesPath) + '/' + path.basename(edgesPath, outputExtension) + '_orphans' + outputExtension;

  const pythonCode = `
from convert_ways_to_edges import convert_ways_to_edges
from pathlib import Path

# convert ways to edges and nodes/vertices
ways_path = Path('${waysPath}')
result = convert_ways_to_edges(ways_path, ${connectionTolerance}, ${minimumEdgeLength}, ${
    allowOrphans ? 'False' : 'True'
  }, '${intermediateCrs}')

# save edges to geopackage
print('Saving edges to ${edgesPath}...')
result['edges'].to_file('${edgesPath}')
#result['nodes'].to_file('${nodesPath}')
#result['orphans'].to_file('${orphansPath}')
`;

  const command = `
  $(conda info --base)/bin/conda run --name convert-ways-to-edges --cwd "${
    import.meta.dirname
  }" python -c """${pythonCode}"""
`;

  await exec(command, true, true);
}
