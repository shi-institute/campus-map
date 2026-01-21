import Router from '@koa/router';
import type { Context } from 'koa';
import {
  generateServiceDirectoryHeader,
  inferServiceResponseFormat,
  initDoc,
  routingDatabasePool,
} from '../../../utils/index.js';
import { requireToken } from '../../auth/index.js';

export default (router: Router) => {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error('Query route can only be registered in development mode.');
  }

  router.get('/query', async (ctx, next) => {
    if (!(await requireToken(ctx, next))) {
      return;
    }

    const format = inferServiceResponseFormat(ctx);

    if (format === 'html') {
      ctx.type = 'text/html';
      ctx.body = generateQueryHtml(ctx, { query: '' });
      return;
    }

    ctx.status = 400;
    ctx.body = { error: 'Only HTML format is supported for this endpoint.' };
    ctx.type = format === 'json' ? 'application/json' : 'text/plain';
  });

  router.post('/query', async (ctx, next) => {
    if (!(await requireToken(ctx, next))) {
      return;
    }

    if (!ctx.request.body || typeof ctx.request.body !== 'object' || !ctx.request.body.q) {
      ctx.status = 400;
      ctx.type = 'application/json';
      ctx.body = { error: 'Missing required "q" parameter in request body.' };
      return;
    }

    const sql = ctx.request.body.q as string;
    const format = inferServiceResponseFormat(ctx);
    const shouldConvertToFeatureCollection = ctx.request.body.convertToFeatureCollection === 'on';

    // extract variable values from request body
    // (any value starting with $ that needs to be replaced in the query)
    const variableValues: Record<`$${string}`, string> = {};
    for (const [key, value] of Object.entries(ctx.request.body)) {
      if (key.startsWith('$') && typeof value === 'string') {
        variableValues[key as `$${string}`] = value;
      }
    }

    // replace variables in the SQL query
    const finalizedSql = Object.entries(variableValues).reduce(
      (accSql, [varName, varValue]) => accSql.replaceAll(varName, varValue),
      sql
    );

    // execute the query against the routing database
    await (async () => {
      const client = await routingDatabasePool.connect();
      try {
        const res = await client.query(finalizedSql);

        if (!res.rows || res.rows.length === 0) {
          throw new Error('No rows returned from the query.');
        }

        if (!shouldConvertToFeatureCollection) {
          return { table: res.rows };
        }

        // convert rows to GeoJSON FeatureCollection
        const features = res.rows.map(
          ({ geometry, ...properties }) =>
            ({
              type: 'Feature',
              geometry,
              properties,
            } as GeoJSON.Feature)
        );

        const featureCollection: GeoJSON.FeatureCollection = {
          type: 'FeatureCollection',
          features,
        };

        return { featureCollection };
      } catch (error) {
        throw error;
      } finally {
        client.release();
      }
    })()
      .then((data) => {
        if (format === 'html') {
          ctx.type = 'text/html';
          ctx.body = generateQueryHtml(
            ctx,
            { query: sql, shouldConvertToFeatureCollection, ...variableValues },
            data
          );
          return;
        }

        ctx.type = format === 'json' ? 'application/json' : 'text/plain';
        ctx.body = JSON.stringify(data, null, 2);
      })
      .catch((error) => {
        ctx.status = 500;

        if (format === 'html') {
          ctx.type = 'text/html';
          ctx.body = generateQueryHtml(
            ctx,
            { query: sql, shouldConvertToFeatureCollection, ...variableValues },
            { error: (error as Error).message }
          );
          return;
        }

        ctx.type = format === 'json' ? 'application/json' : 'text/plain';
        ctx.body = JSON.stringify({ error: (error as Error).message }, null, 2);
      });
  });
};

interface QueryValues {
  query: string;
  shouldConvertToFeatureCollection?: boolean;
  [key: `$${string}`]: string;
}

interface Result {
  table?: Record<string | number, unknown>[];
  featureCollection?: GeoJSON.FeatureCollection;
  error?: string;
}

function generateQueryHtml(ctx: Context, values: QueryValues, result: Result = {}): string {
  const pathParts = ctx.path.split('/');
  const serviceName = decodeURIComponent(pathParts[pathParts.length - 3] || '');

  const { query, shouldConvertToFeatureCollection, ...variables } = values;

  const { document, body, titleElement } = initDoc('Query ' + serviceName);

  // write header
  const headerTables = generateServiceDirectoryHeader(
    { document, user: ctx.state.user },
    {
      serviceRootPathname: '/rest/services',
      currentPathname: ctx.path,
    }
  );
  headerTables.forEach((table) => body.appendChild(table));
  body.appendChild(titleElement);

  // body
  const rbody = document.createElement('div');
  rbody.setAttribute('class', 'rbody');
  body.appendChild(rbody);

  // error message
  if (result.error) {
    const errorDiv = document.createElement('div');
    errorDiv.setAttribute('style', 'color: red;');
    errorDiv.appendChild(document.createTextNode(result.error));
    const br = document.createElement('br');
    errorDiv.appendChild(br);
    rbody.appendChild(errorDiv);
  }

  // form
  const form = document.createElement('form');
  form.setAttribute('method', 'POST');
  form.setAttribute('action', ctx.path);
  rbody.appendChild(form);

  const formTable = document.createElement('div');
  formTable.setAttribute('class', 'formTable');
  form.appendChild(formTable);

  const queryEditor = document.createElement('div');
  queryEditor.setAttribute('id', 'monaco-query-editor');
  queryEditor.setAttribute(
    'style',
    'height: 400px; width: 100%; border: 1px solid #ccc; margin-bottom: 10px;'
  );
  formTable.appendChild(queryEditor);

  const invisibleQueryInput = document.createElement('input');
  invisibleQueryInput.setAttribute('type', 'hidden');
  invisibleQueryInput.setAttribute('name', 'q');
  formTable.appendChild(invisibleQueryInput);

  const inputsContainer = document.createElement('table');
  inputsContainer.setAttribute('id', 'inputs-container');
  formTable.appendChild(inputsContainer);

  // insert any pre-provided variable values
  for (const [varName, varValue] of Object.entries(variables)) {
    const tr = document.createElement('tr');
    const tdLabel = document.createElement('td');
    tdLabel.textContent = varName + ':';
    const tdInput = document.createElement('td');
    const input = document.createElement('input');
    input.setAttribute('type', 'text');
    input.setAttribute('name', varName);
    input.setAttribute('required', '');
    input.setAttribute('value', varValue);
    tdInput.appendChild(input);
    tr.appendChild(tdLabel);
    tr.appendChild(tdInput);
    inputsContainer.appendChild(tr);
  }

  const loaderScript = document.createElement('script');
  loaderScript.textContent = `
  (function() {
    function initMonaco() {
      // 1. Load the loader script dynamically
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/loader.min.js';
      s.onload = () => {
        require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' }});
        require(['vs/editor/editor.main'], function() {
          window.editor = monaco.editor.create(document.getElementById('monaco-query-editor'), {
            value: \`${query || vertexRoutingQuery}\`,
            language: 'sql',
            theme: 'vs-light',
            automaticLayout: true
          });

          // regex that looks for $word (e.g., $startLongitude)
          const VARIABLE_REGEX = /\\$[a-zA-Z_]\\w*/g;

          function syncInputs(sqlText) {
            // Step 1. Extract unique variables from the editor
            const matches = sqlText.match(VARIABLE_REGEX) || [];
            const uniqueVars = [...new Set(matches)];
            console.log('SQL Text:', sqlText);
            console.log('Detected variables:', uniqueVars);

            // Step 2. Get the container where we display inputs
            const container = document.getElementById('inputs-container');
            
            // Step 3. Clear or update inputs
            renderInputs(uniqueVars, container);

            // Step 4. Update hidden input with current SQL
            const hiddenInput = document.querySelector('input[name="q"]');
            if (hiddenInput) {
              hiddenInput.value = sqlText;
            }
          }

          function renderInputs(variables, container) {            
            // remove inputs no longer in variables list
            const currentInputs = Array.from(container.querySelectorAll("input"));
            currentInputs.forEach((input) => {
              if (!variables.includes(input.name)) {
                input.closest("tr").remove();
              }
            });

            // add missing inputs
            variables.forEach((varName, index) => {
              // check if the input already exists
              let existingRow = container.querySelector(\`input[name="\${CSS.escape(varName)}"]\`)?.closest("tr");

              if (!existingRow) {
                const tr = document.createElement("tr");
                const tdLabel = document.createElement("td");
                tdLabel.textContent = varName + ":";
                const tdInput = document.createElement("td");
                const input = document.createElement("input");
                input.type = "text";
                input.name = varName;
                input.required = true;
                tdInput.appendChild(input);
                tr.appendChild(tdLabel);
                tr.appendChild(tdInput);
                existingRow = tr;
              }

              // move or insert the row at the correct position
              // if there is a different existing row at the 
              // correct position
              const rowAtDesination = container.children[index];
              if (rowAtDesination && rowAtDesination !== existingRow) {
                container.insertBefore(existingRow, rowAtDesination);
              } else if (!rowAtDesination) {
                container.appendChild(existingRow);
              }
            });
          }

          syncInputs(\`${query || vertexRoutingQuery}\`);
          window.editor.getModel().onDidChangeContent((event) => {
            const currentSql = window.editor.getValue();
            syncInputs(currentSql);
          });
        });
      };
      document.head.appendChild(s);
    }
    initMonaco();
  })();
`;
  rbody.appendChild(loaderScript);

  const staticTableContainer = document.createElement('table');
  formTable.appendChild(staticTableContainer);

  // button to say that the data should be rendered as a FeatureCollection
  const convertRow = document.createElement('tr');
  const convertCell = document.createElement('td');
  convertCell.setAttribute('colspan', '2');
  const convertLabel = document.createElement('label');
  const convertCheckbox = document.createElement('input');
  convertCheckbox.setAttribute('type', 'checkbox');
  convertCheckbox.setAttribute('name', 'convertToFeatureCollection');
  if (shouldConvertToFeatureCollection === true || shouldConvertToFeatureCollection === undefined) {
    convertCheckbox.setAttribute('checked', 'true');
  }
  convertLabel.appendChild(convertCheckbox);
  convertLabel.appendChild(document.createTextNode(' Convert result to GeoJSON FeatureCollection'));
  convertCell.appendChild(convertLabel);
  convertRow.appendChild(convertCell);
  staticTableContainer.appendChild(convertRow);

  // submit button
  const submitRow = document.createElement('tr');
  const submitCell = document.createElement('td');
  submitCell.setAttribute('colspan', '2');
  submitCell.setAttribute('align', 'left');
  const submitButton = document.createElement('input');
  submitButton.setAttribute('type', 'submit');
  submitButton.setAttribute('value', 'Query (POST)');
  submitCell.appendChild(submitButton);
  submitRow.appendChild(submitCell);
  staticTableContainer.appendChild(submitRow);

  // show the result feature collection if provided
  if (result.featureCollection) {
    const mapTitle = document.createElement('h2');
    mapTitle.appendChild(document.createTextNode('Map'));
    rbody.appendChild(mapTitle);

    const mapDiv = document.createElement('div');
    mapDiv.setAttribute('id', 'mapTemplateInjectArea');
    rbody.appendChild(mapDiv);
  }

  // render table data
  if (result.table || result.featureCollection) {
    const tableTitle = document.createElement('h2');
    tableTitle.appendChild(document.createTextNode('Table'));
    rbody.appendChild(tableTitle);

    const data =
      result.table ||
      result.featureCollection?.features.map((feature) => {
        return 'properties' in feature ? feature.properties : {};
      }) ||
      [];

    const allPropertyNames = new Set<string>();
    data.forEach((row) => {
      Object.keys(row || {}).forEach((propName) => {
        allPropertyNames.add(propName);
      });
    });

    const resultTable = document.createElement('table');
    resultTable.setAttribute('border', '1');
    resultTable.setAttribute('style', 'border-collapse: collapse; margin-bottom: 22px;');
    const headerRow = document.createElement('tr');
    allPropertyNames.forEach((propName) => {
      const th = document.createElement('th');
      th.appendChild(document.createTextNode(propName));
      headerRow.appendChild(th);
    });
    resultTable.appendChild(headerRow);

    data.forEach((row) => {
      const tr = document.createElement('tr');
      allPropertyNames.forEach((propName) => {
        const td = document.createElement('td');
        const propValue = row?.[propName];
        td.appendChild(document.createTextNode(propValue !== undefined ? String(propValue) : ''));
        tr.appendChild(td);
      });
      resultTable.appendChild(tr);
    });

    rbody.appendChild(resultTable);
  }

  const docString = document.toString();

  const mapTemplate = `
<link rel="stylesheet" href="https://js.arcgis.com/4.34/esri/themes/light/main.css" />

<script type="module">
  import Map from "https://js.arcgis.com/4.34/@arcgis/core/Map.js";
  import GeoJSONLayer from "https://js.arcgis.com/4.34/@arcgis/core/layers/GeoJSONLayer.js";
  import MapView from "https://js.arcgis.com/4.34/@arcgis/core/views/MapView.js";

  const geojsonObject = ${JSON.stringify(result.featureCollection)};

  const url = URL.createObjectURL(
    new Blob([JSON.stringify(geojsonObject)], { type: "application/json" })
  );

  const geojsonLayer = new GeoJSONLayer({
    url: url,
  });

  const map = new Map({
    basemap: "gray-vector",
    layers: [geojsonLayer],
  });

  const view = new MapView({
    container: "viewDiv",
    center: [-168, 46],
    zoom: 2,
    map: map,
  });

  // zoom to the layer extent once it loads
  geojsonLayer.when(() => {
    view.goTo(geojsonLayer.fullExtent);
  });
</script>
<div id="viewDiv" style="height: 500px; border: 1px solid black;"></div>
`;

  return docString.replace('<div id="mapTemplateInjectArea"></div>', mapTemplate);
}

const vertexRoutingQuery = `WITH
  -- Step 1. Find the closest vertex to the provided start coordinates
  closest_start_vertex AS (
    SELECT id
    FROM vertices
    ORDER BY geom <-> ST_Transform(
      -- Create a point from the provided start coordinates
      ST_SetSRID(ST_MakePoint($startLongitude, $startLatitude), $startSRID),
      -- Transform the created point to the SRID of the edges table
      -- so we can do proper distance calculations
      (SELECT Find_SRID('public', 'edges', 'geom'))
    )
    -- Only return the closest vertex
    LIMIT 1
  ),

  -- Step 2. Find the closest vertex to the provided destination coordinates
  closest_end_vertex AS (
    SELECT id
    FROM vertices
    ORDER BY geom <-> ST_Transform(
      ST_SetSRID(ST_MakePoint($destinationLongitude, $destinationLatitude), $destinationSRID),
      (SELECT Find_SRID('public', 'edges', 'geom'))
    )
    LIMIT 1
  ),

  -- Step 3. Compute the shortest path between the two vertices
  route AS (
    SELECT *
    -- Use Dijkstra's algorithm to find the shortest path
    FROM pgr_dijkstra(
      -- Convert columns from the edges table into the format expected by pgRouting
      'SELECT 
          id AS id, 
          start_vertex AS source, 
          end_vertex AS target, 
          cost__distance AS cost, 
          reverse_cost__distance AS reverse_cost 
        FROM edges',
      -- Provided the two vertices created in steps 1 and 2
      (SELECT id FROM closest_start_vertex),
      (SELECT id FROM closest_end_vertex),
      -- Indicates that reverse_cost must be present in order
      -- for an edge to be traversed in the reverse direction
      -- (treat missing reverse_cost as a one-way street/path)
      directed := true
    )
  )

-- Step 4. Return the resulting route with geometries
SELECT
  route.seq AS step,
  edges.id AS edge_id,
  route.node AS edge_end_vertex_id,
  route.cost AS edge_cost,
  -- Convert the geometry output into GeoJSON format
  -- for easy display on web maps
  ST_AsGeoJSON(edges.geom)::jsonb AS geometry
  
FROM route

-- Join the pgr_dijkstra results (which are just IDs) back to the 'edges' 
-- table to retrieve the line geometries
JOIN edges
  ON edges.id = route.edge

-- pgRouting adds a 'final' row with edge = -1 to represent the destination node.
-- We filter this out because -1 doesn't exist in our 'edges' table and 
-- has no geometry to draw.
WHERE route.edge <> -1

-- Ensure the result is ordered sequentially from start to end
ORDER BY route.seq;
`;
