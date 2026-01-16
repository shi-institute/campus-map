import { DOMParser } from '@xmldom/xmldom';
import { generateServiceDirectoryHeader, unwrapServiceName } from './index.js';

interface DataInput {
  data: Record<string, unknown>;
  center?: { latitude?: number; longitude?: number; zoom?: number };
  user: Express.User | undefined;
}

interface RouteInput {
  serviceRootPathname: string;
  currentUrl: URL;
}

export function extractServiceNameFromUrl(url: URL): string {
  const pathParts = url.pathname.split('/');
  let serviceName = decodeURIComponent(pathParts[pathParts.length - 2] || '');
  serviceName = unwrapServiceName(serviceName);
  return serviceName;
}

export function initDoc(title = 'REST API') {
  const document = new DOMParser().parseFromString(
    '<!DOCTYPE html><html><head></head><body></body></html>',
    'text/html'
  );
  const head = document.getElementsByTagName('head')[0];
  if (!head) throw new Error('Document head is missing.');
  const body = document.getElementsByTagName('body')[0];
  if (!body) throw new Error('Document body is missing.');

  const space = () => document.createTextNode('\u00A0\u00A0');

  if (head) {
    const titleElement = document.createElement('title');
    titleElement.appendChild(document.createTextNode(title));
    head.appendChild(titleElement);

    const style = document.createElement('style');
    style.appendChild(document.createTextNode(arcGisCss));
    head.appendChild(style);
  }

  const h2 = document.createElement('h2');
  h2.appendChild(document.createTextNode(title));

  // script to extract token from the URL query param and add
  // it to every anchor tag href as a query param
  const scriptElement = document.createElement('script');
  scriptElement.appendChild(
    document.createTextNode(`
      document.addEventListener('DOMContentLoaded', function() {
        const searchParams = new URLSearchParams(window.location.search);
        const token = searchParams.get('token');
        if (token) {
          const anchorTags = document.getElementsByTagName('a');
          for (let i = 0; i < anchorTags.length; i++) {
            const anchor = anchorTags[i];
            const href = anchor.getAttribute('href');
            const noTokenAttr = anchor.getAttribute('data-no-token');
            const noToken = noTokenAttr === '' || noTokenAttr === 'true';
            if (href && !href.includes('token=') && !noToken) {
              const separator = href.includes('?') ? '&' : '?';
              anchor.setAttribute('href', href + separator + 'token=' + encodeURIComponent(token));
            }
            if (href && href.includes('token=') && noToken) {
              const url = new URL(href, window.location.origin);
              url.searchParams.delete('token');
              anchor.setAttribute('href', url.pathname + url.search + url.hash);
            }
          }
        }
      });
    `)
  );
  body.appendChild(scriptElement);

  return { document, head, body, space, titleElement: h2 };
}

/**
 * Converts any JSON data into nested HTML lists dynamically.
 * Produces readable, structured output for arbitrary JSON.
 */
export function jsonToArcGisHtml(
  { data, center, user }: DataInput,
  { currentUrl: url, serviceRootPathname }: RouteInput
): string {
  // force https
  url.protocol = 'https:';

  // extract service type and name from URL
  const pathParts = url.pathname.split('/');
  const type = pathParts[pathParts.length - 1] as 'VectorTileServer' | 'FU.RoutingServer' | 'FeatureServer';
  const serviceName = extractServiceNameFromUrl(url);

  const { document, body, space, titleElement } = initDoc(serviceName || 'Service');

  // write header
  const headerTables = generateServiceDirectoryHeader(
    {
      document,
      user,
      formats: [
        { format: 'json', href: `?f=json` },
        { format: 'pjson', href: `?f=pjson` },
      ],
    },
    { serviceRootPathname, currentPathname: url.pathname }
  );
  headerTables.forEach((table) => body.appendChild(table));
  body.appendChild(titleElement);

  // properties div
  const propertiesDiv = document.createElement('div');
  propertiesDiv.setAttribute('class', 'rbody');
  body.appendChild(propertiesDiv);

  function writeProperty(label: string, ...elements: (Element | Node)[]) {
    if (label) {
      const b = document.createElement('b');
      b.appendChild(document.createTextNode(label + ': '));
      propertiesDiv.appendChild(b);
      propertiesDiv.appendChild(space());
    }

    const reducedSpaceAtEnd = elements.length === 1 && elements[0]?.nodeName === 'ul';

    elements.forEach((element, index) => {
      propertiesDiv.appendChild(element);

      const isLast = index === elements.length - 1;
      if (reducedSpaceAtEnd && isLast) return;

      propertiesDiv.appendChild(space());
      propertiesDiv.appendChild(space());
    });

    if (reducedSpaceAtEnd) {
      return;
    } else {
      propertiesDiv.appendChild(document.createElement('br'));
      propertiesDiv.appendChild(document.createElement('br'));
    }
  }

  // view in links
  var linkElements: Element[] = [];
  if (type === 'VectorTileServer' || type === 'FeatureServer') {
    const viewInJsApiLink = document.createElement('a');
    viewInJsApiLink.setAttribute('href', `?f=jsapi`);
    viewInJsApiLink.appendChild(document.createTextNode('ArcGIS JavaScript'));
    linkElements.push(viewInJsApiLink);
  }
  if (type === 'FeatureServer') {
    const viewInArcGisProLink = document.createElement('a');
    viewInArcGisProLink.setAttribute('href', `?f=pitemx`);
    viewInArcGisProLink.appendChild(document.createTextNode('ArcGIS Pro'));
    linkElements.push(viewInArcGisProLink);
  }
  if (type === 'VectorTileServer' || type === 'FeatureServer') {
    const viewInArcGISOnlineLink = document.createElement('a');
    viewInArcGISOnlineLink.setAttribute(
      'href',
      `https://www.arcgis.com/apps/mapviewer/index.html?url=${encodeURIComponent(url.toString())}`
    );
    viewInArcGISOnlineLink.appendChild(document.createTextNode('ArcGIS Online'));
    linkElements.push(viewInArcGISOnlineLink);
    const viewInFurmanGisLink = document.createElement('a');
    viewInFurmanGisLink.setAttribute(
      'href',
      `https://gis.furman.edu/portal/apps/mapviewer/index.html?url=${encodeURIComponent(url.toString())}`
    );
    viewInFurmanGisLink.appendChild(document.createTextNode('Furman GIS Portal'));
    linkElements.push(viewInFurmanGisLink);
  }
  if (type === 'VectorTileServer' && center) {
    const viewInMaputnikLink = document.createElement('a');
    const centerHash =
      center.latitude && center.longitude && center.zoom
        ? `#${center.zoom}/${center.latitude}/${center.longitude}`
        : '';
    const maputnikUrl = new URL(
      `https://maplibre.org/maputnik/?style=${url.href}/resources/styles/root.json${centerHash}`
    );
    viewInMaputnikLink.setAttribute('href', maputnikUrl.toString());
    viewInMaputnikLink.appendChild(document.createTextNode('Maputnik'));
    linkElements.push(viewInMaputnikLink);
  }
  if (type === 'VectorTileServer' && serviceName === 'FurmanCampusMap') {
    const viewInCampusMapLink = document.createElement('a');
    viewInCampusMapLink.setAttribute('href', '/');
    viewInCampusMapLink.appendChild(document.createTextNode('Furman Campus Map'));
    linkElements.push(viewInCampusMapLink);
  }
  if (type === 'FU.RoutingServer' && serviceName === 'FurmanCampusGraph') {
    const viewInCampusMapLink = document.createElement('a');
    viewInCampusMapLink.setAttribute('href', '/');
    viewInCampusMapLink.appendChild(document.createTextNode('Furman Campus Map'));
    linkElements.push(viewInCampusMapLink);
  }
  writeProperty('View in', ...linkElements);

  // styles
  if (type === 'VectorTileServer' && typeof data.defaultStyles === 'string') {
    const styleLink = document.createElement('a');
    const styleUrl = new URL(url.toString());
    styleUrl.pathname += '/' + data.defaultStyles + '/root.json';
    styleLink.setAttribute('href', styleUrl.toString());
    styleLink.appendChild(document.createTextNode('Default Styles'));
    writeProperty('Styles', styleLink);
    data.defaultStyles = undefined;
  }

  // service description
  if (typeof data.serviceDescription === 'string' || data.serviceDescription === undefined) {
    const serviceDescription = document.createTextNode(data.serviceDescription || '');
    writeProperty('Service Description', serviceDescription);
    data.serviceDescription = undefined;
  }

  // all layers and tables
  if (type === 'FeatureServer') {
    const allLayersLink = document.createElement('a');
    const allLayersUrl = new URL(url.toString());
    allLayersUrl.pathname += '/layers';
    allLayersUrl.searchParams.set('f', 'pjson');
    allLayersLink.setAttribute('href', withoutOrigin(allLayersUrl));
    allLayersLink.appendChild(document.createTextNode('All Layers and Tables'));
    writeProperty('', allLayersLink);
  }

  // hasVersionedData
  if (typeof data.hasVersionedData === 'boolean') {
    const hasVersionedData = document.createTextNode(data.hasVersionedData ? 'true' : 'false');
    writeProperty('Has Versioned Data', hasVersionedData);
    data.hasVersionedData = undefined;
  }

  // maxRecordCount
  if (typeof data.maxRecordCount === 'number') {
    const maxRecordCount = document.createTextNode(data.maxRecordCount.toString());
    writeProperty('MaxRecordCount', maxRecordCount);
    data.maxRecordCount = undefined;
  }

  // supportedQueryFormats
  if (typeof data.supportedQueryFormats === 'string') {
    const supportedQueryFormats = document.createTextNode(data.supportedQueryFormats);
    writeProperty('Supported Query Formats', supportedQueryFormats);
    data.supportedQueryFormats = undefined;
  }

  // layers bullets
  if (Array.isArray(data.layers)) {
    const layersList = document.createElement('ul');
    (data.layers as any[]).forEach((layer) => {
      const li = document.createElement('li');
      const layerLink = document.createElement('a');
      const layerUrl = new URL(url.toString());
      layerUrl.pathname += `/${layer.id}`;
      layerUrl.searchParams.set('f', 'pjson');
      layerLink.setAttribute('href', withoutOrigin(layerUrl));
      let layerName = layer.name || `Layer ${layer.id}`;
      if (typeof layerName !== 'string') {
        layerName = `Layer ${layer.id}`;
      }
      layerLink.appendChild(document.createTextNode(layerName));
      li.appendChild(layerLink);
      layersList.appendChild(li);
    });

    if (layersList.childNodes.length > 0) {
      writeProperty('Layers', layersList);
    }

    data.layers = undefined;
  }

  // tables bullets
  if (Array.isArray(data.tables)) {
    const tablesList = document.createElement('ul');
    (data.tables as any[]).forEach((table) => {
      const li = document.createElement('li');
      const tableLink = document.createElement('a');
      const tableUrl = new URL(url.toString());
      tableUrl.pathname += `/${table.id}`;
      tableUrl.searchParams.set('f', 'pjson');
      tableLink.setAttribute('href', withoutOrigin(tableUrl));
      let tableName = table.name || `Table ${table.id}`;
      if (typeof tableName !== 'string') {
        tableName = `Table ${table.id}`;
      }
      tableLink.appendChild(document.createTextNode(tableName));
      li.appendChild(tableLink);
      tablesList.appendChild(li);
    });

    if (tablesList.childNodes.length > 0) {
      writeProperty('Tables', tablesList);
    }

    data.tables = undefined;
  }

  if ((typeof data.name === 'string' || data.name === undefined) && type !== 'FeatureServer') {
    const name = document.createTextNode(data.name || serviceName);
    writeProperty('Name', name);
    data.name = undefined;
  }

  if (typeof data.description === 'string' || data.description === undefined) {
    const description = document.createTextNode(data.description || '');
    writeProperty('Description', description);
    data.description = undefined;
  }

  if (typeof data.copyrightText === 'string' || data.copyrightText === undefined) {
    const copyrightText = document.createTextNode(data.copyrightText || '');
    writeProperty('Copyright Text', copyrightText);
    data.copyrightText = undefined;
  }

  // spatial reference
  if (data.spatialReference) {
    const spatialRefText = parseSpatialReference(data.spatialReference);

    if (spatialRefText) {
      const spatialReference = document.createTextNode(spatialRefText);
      writeProperty('Spatial Reference', spatialReference);
    }

    data.spatialReference = undefined;
  }

  function renderExtent(label: string, extent: Record<string, any>) {
    const xMinText = document.createTextNode('XMin: ' + extent.xmin);
    const yMinText = document.createTextNode('YMin: ' + extent.ymin);
    const xMaxText = document.createTextNode('XMax: ' + extent.xmax);
    const yMaxText = document.createTextNode('YMax: ' + extent.ymax);
    const spatialRefText = document.createTextNode(
      'Spatial Reference: ' + parseSpatialReference(extent.spatialReference)
    );

    const ul = document.createElement('ul');
    ul.appendChild(xMinText);
    ul.appendChild(document.createElement('br'));
    ul.appendChild(yMinText);
    ul.appendChild(document.createElement('br'));
    ul.appendChild(xMaxText);
    ul.appendChild(document.createElement('br'));
    ul.appendChild(yMaxText);
    ul.appendChild(document.createElement('br'));
    ul.appendChild(spatialRefText);

    writeProperty(label, ul);
  }

  // initial extent
  if (data.initialExtent) {
    const initialExtent = data.initialExtent as Record<string, any>;
    renderExtent('Initial Extent', initialExtent);
    data.initialExtent = undefined;
  }

  // full extent
  if (data.fullExtent) {
    const fullExtent = data.fullExtent as Record<string, any>;
    renderExtent('Full Extent', fullExtent);
    data.fullExtent = undefined;
  }

  // write remaining properties as JSON
  const restJson = document.createElement('pre');
  restJson.appendChild(document.createTextNode(JSON.stringify(data, null, 2)));
  writeProperty('Additional Properties', restJson);

  return document.toString();
}

export const arcGisCss = `
BODY {
  PADDING-LEFT: 22px; PADDING-RIGHT: 22px; BACKGROUND: #fff; PADDING-BOTTOM: 0px; MARGIN: 0px; PADDING-TOP: 0px; FONT-FAMILY: Verdana, Arial, Helvetica, sans-serif; min-width: 780px;
}
HTML {
  PADDING-LEFT: 0px; PADDING-RIGHT: 0px; BACKGROUND: #fff; PADDING-BOTTOM: 0px; MARGIN: 0px; PADDING-TOP: 0px; FONT-FAMILY: Verdana, Arial, Helvetica, sans-serif; min-width: 780px;
}
CODE {
	FONT-SIZE: 1.3em; FONT-FAMILY: serif
}

TD {
  PADDING-RIGHT: 11px; PADDING-LEFT: 0px; FONT-SIZE: 0.90em; PADDING-BOTTOM: 5px; MARGIN: 0px 0px 3px; PADDING-TOP: 3px; 
}

H2 {
  MARGIN-LEFT: 0px; FONT-WEIGHT: bold; FONT-SIZE: 1.2em
}
H3 {
  FONT-WEIGHT: bold; FONT-SIZE: 1.25em; MARGIN-BOTTOM: 0px; 
}
LI {
  PADDING-RIGHT: 0px; PADDING-LEFT: 0px; PADDING-BOTTOM: 3px; PADDING-TOP: 0px; 
}

.rbody {
	 FONT-SIZE:0.9em; MARGIN-LEFT: 0px; 
}

.apiref {
  FONT-SIZE: 0.6em; MARGIN: 0px; PADDING: 0px;
}

.whiteTd {
  BACKGROUND-COLOR: #FFFFFF;
}

.breadcrumbs {
  PADDING-RIGHT: 0px; PADDING-LEFT: 0px; FONT-SIZE: 0.8em; FONT-WEIGHT: bold; PADDING-BOTTOM: 5px; MARGIN: 0px 0px 3px; PADDING-TOP: 0px;
}

.userTable {
  FONT-SIZE: 0.80em;
}

.navTable {
  PADDING-BOTTOM: 5px; MARGIN: 0px 0px 3px; PADDING-TOP: 0px; BORDER-BOTTOM: #000 1px solid; BORDER-TOP: #000 1px solid; BACKGROUND-COLOR: #E5EFF7;
}

.loginTable {
	PADDING: 5px; MARGIN: 10px 0px 3px; BORDER: #000 1px solid; BACKGROUND-COLOR: #E5EFF7;
}
.formTable {
  PADDING: 5px; MARGIN: 10px 0px 3px; BORDER: #000 1px solid; BACKGROUND-COLOR: #E5EFF7;
}
.infoTable {
  FONT-SIZE: 1.1em; PADDING: 5px; MARGIN: 10px 0px 3px; BORDER: #000 1px solid; BACKGROUND-COLOR: #E5EFF7;
}

.adminNavTable {
	PADDING-BOTTOM: 5px; MARGIN: 0px 0px 3px; PADDING-TOP: 0px; BORDER-BOTTOM: #000 1px solid; BORDER-TOP: #000 1px solid; BACKGROUND-COLOR: #F7EFE5;
}

.adminLoginTable {
	PADDING: 5px; MARGIN: 10px 0px 3px; BORDER: #000 1px solid; BACKGROUND-COLOR: #F7EFE5;
}
.adminFormTable {
  PADDING: 5px; MARGIN: 10px 0px 3px; BORDER: #000 1px solid; BACKGROUND-COLOR: #F7EFE5;
}
.adminInfoTable {
  FONT-SIZE: 1.1em; PADDING: 5px; MARGIN: 10px 0px 3px; BORDER: #000 1px solid; BACKGROUND-COLOR: #F7EFE5;
}

.help {
	PADDING-RIGHT: 11px; PADDING-LEFT: 0px; FONT-SIZE: 0.70em; PADDING-BOTTOM: 5px; MARGIN: 0px 0px 3px; PADDING-TOP: 3px; 
}
.titlecell {
	PADDING-RIGHT: 0px; PADDING-LEFT: 0px; FONT-SIZE: 1.0em; FONT-WEIGHT:bold; PADDING-BOTTOM: 5px; MARGIN: 0px 0px 3px; PADDING-TOP: 3px; 
}

.srsMain {
  FONT-SIZE: 0.8em; FONT-WEIGHT: bold; BORDER-TOP: #000 1px solid; BACKGROUND-COLOR: #E5EFF7;
}
.srTitle {  FONT-SIZE: 1.2em; }
.srContent {  FONT-SIZE: 1.0em; }
.srLinks {  FONT-SIZE: 0.8em; }
.srInfo {  FONT-SIZE: 0.8em; COLOR:#494; }
`;

function withoutOrigin(url: URL) {
  return url.pathname + url.search + url.hash;
}

function parseSpatialReference(spatialReference: { wkid?: number; latestWkid?: number }): string {
  const wkid = spatialReference.wkid?.toString();
  const latestWkid = spatialReference.latestWkid?.toString();

  if ((wkid && !latestWkid) || (wkid && wkid === latestWkid)) {
    return wkid;
  }

  if (latestWkid && !wkid) {
    return latestWkid;
  }

  if (wkid && latestWkid) {
    return `${wkid} (${latestWkid})`;
  }

  return '';
}
