import { DOMParser } from '@xmldom/xmldom';
import { knownServiceTypes } from '../routes/services/discoverServices.js';
import { constants } from './index.js';

interface DataInput {
  data: Record<string, unknown>;
  center?: { latitude?: number; longitude?: number; zoom?: number };
}

interface RouteInput {
  serviceRootPathname: string;
  currentUrl: URL;
}

/**
 * Converts any JSON data into nested HTML lists dynamically.
 * Produces readable, structured output for arbitrary JSON.
 */
export function jsonToArcGisHtml(
  { data, center }: DataInput,
  { currentUrl: url, serviceRootPathname }: RouteInput
): string {
  const document = new DOMParser().parseFromString(
    '<!DOCTYPE html><html><head></head><body></body></html>',
    'text/html'
  );
  const head = document.getElementsByTagName('head')[0];
  if (!head) return '';
  const body = document.getElementsByTagName('body')[0];
  if (!body) return '';

  // force https
  url.protocol = 'https:';

  // extract service type and name from URL
  const pathParts = url.pathname.split('/');
  const type = pathParts[pathParts.length - 1] as 'VectorTileServer' | 'FU.RoutingServer';
  const serviceName = pathParts[pathParts.length - 2];

  const space = () => document.createTextNode('\u00A0\u00A0');

  // write head
  const title = document.createElement('title');
  title.appendChild(document.createTextNode(serviceName || 'Service'));
  head.appendChild(title);

  const style = document.createElement('style');
  style.appendChild(document.createTextNode(arcGisCss));
  head.appendChild(style);

  // write header
  const headerTable = document.createElement('table');
  headerTable.setAttribute('class', 'userTable');
  headerTable.setAttribute('width', '100%');
  const headerRow = document.createElement('tr');
  const titleCell = document.createElement('td');
  titleCell.setAttribute('class', 'titlecell');
  titleCell.appendChild(document.createTextNode(constants.servicesDirectoryTitle));
  headerRow.appendChild(titleCell);
  headerTable.appendChild(headerRow);
  body.appendChild(headerTable);

  // write base breadcrumbs
  const navTable = document.createElement('table');
  navTable.setAttribute('class', 'navTable');
  navTable.setAttribute('width', '100%');
  const breadcrumbsRow = document.createElement('tr');
  breadcrumbsRow.setAttribute('valign', 'top');
  const breadcrumbsCell = document.createElement('td');
  breadcrumbsCell.setAttribute('class', 'breadcrumbs');
  const homeLink = document.createElement('a');
  homeLink.setAttribute('href', serviceRootPathname);
  homeLink.appendChild(document.createTextNode('Home'));
  breadcrumbsCell.appendChild(homeLink);
  breadcrumbsCell.appendChild(document.createTextNode(' > '));
  const servicesLink = document.createElement('a');
  servicesLink.setAttribute('href', serviceRootPathname);
  servicesLink.appendChild(document.createTextNode('Services'));
  breadcrumbsCell.appendChild(servicesLink);
  breadcrumbsRow.appendChild(breadcrumbsCell);
  navTable.appendChild(breadcrumbsRow);
  body.appendChild(navTable);

  // write breadcrumbs for current path
  if (url.pathname !== serviceRootPathname) {
    const pathParts = url.pathname
      .replace(serviceRootPathname, '')
      .split('/')
      .filter((part) => part.length > 0);

    let cumulativePath = serviceRootPathname;
    const partLinks = pathParts.reduce((acc, part) => {
      cumulativePath += `/${part}`;

      if ((knownServiceTypes as readonly string[]).includes(part)) {
        const previousPartElem = acc.pop();
        const previousPartElemTextNode = previousPartElem?.firstChild;
        if (previousPartElemTextNode && previousPartElemTextNode.nodeType === previousPartElem.TEXT_NODE) {
          const modifiedPartTextNode = document.createTextNode(previousPartElem.textContent + ` (${part})`);
          previousPartElem.replaceChild(modifiedPartTextNode, previousPartElemTextNode);
          previousPartElem.setAttribute('href', cumulativePath);
          return [...acc, previousPartElem];
        }
      }

      const partLink = document.createElement('a');
      partLink.setAttribute('href', cumulativePath);
      partLink.appendChild(document.createTextNode(part));
      return [...acc, partLink];
    }, [] as HTMLAnchorElement[]);

    partLinks.forEach((partLink, index) => {
      const separator = document.createTextNode(' > ');
      breadcrumbsCell.appendChild(separator);
      breadcrumbsCell.appendChild(partLink);
    });
  }

  // formats
  const formatsTable = document.createElement('table');
  const formatsRow = document.createElement('tr');
  const formatsCell = document.createElement('td');
  formatsCell.setAttribute('class', 'apiref');
  const jsonLink = document.createElement('a');
  jsonLink.setAttribute('href', `?f=json`);
  jsonLink.appendChild(document.createTextNode('JSON'));
  formatsCell.appendChild(jsonLink);
  formatsCell.appendChild(document.createTextNode(' | '));
  const pjsonLink = document.createElement('a');
  pjsonLink.setAttribute('href', `?f=pjson`);
  pjsonLink.appendChild(document.createTextNode('PJSON'));
  formatsCell.appendChild(pjsonLink);
  formatsRow.appendChild(formatsCell);
  formatsTable.appendChild(formatsRow);
  body.appendChild(formatsTable);

  // header
  const h2 = document.createElement('h2');
  const titleText = serviceName || 'Service';
  h2.appendChild(document.createTextNode(titleText + ` (${type})`));
  body.appendChild(h2);

  // properties div
  const propertiesDiv = document.createElement('div');
  propertiesDiv.setAttribute('class', 'rbody');
  body.appendChild(propertiesDiv);

  function writeProperty(label: string, ...elements: (Element | Node)[]) {
    const b = document.createElement('b');
    b.appendChild(document.createTextNode(label + ': '));
    propertiesDiv.appendChild(b);
    propertiesDiv.appendChild(space());
    elements.forEach((element) => {
      propertiesDiv.appendChild(element);
      propertiesDiv.appendChild(space());
      propertiesDiv.appendChild(space());
    });
    propertiesDiv.appendChild(document.createElement('br'));
    propertiesDiv.appendChild(document.createElement('br'));
  }

  // view in links
  var linkElements: Element[] = [];
  if (type === 'VectorTileServer') {
    const viewInJsApiLink = document.createElement('a');
    viewInJsApiLink.setAttribute('href', `?f=jsapi`);
    viewInJsApiLink.appendChild(document.createTextNode('ArcGIS JavaScript'));
    linkElements.push(viewInJsApiLink);
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
  if (type === 'VectorTileServer' && serviceName === 'FurmanCampusMap' && process.env.CAMPUS_MAP_WEB_URL) {
    const viewInCampusMapLink = document.createElement('a');
    viewInCampusMapLink.setAttribute('href', process.env.CAMPUS_MAP_WEB_URL);
    viewInCampusMapLink.appendChild(document.createTextNode('Furman Campus Map'));
    linkElements.push(viewInCampusMapLink);
  }
  if (type === 'FU.RoutingServer' && serviceName === 'FurmanCampusGraph' && process.env.CAMPUS_MAP_WEB_URL) {
    const viewInCampusMapLink = document.createElement('a');
    viewInCampusMapLink.setAttribute('href', process.env.CAMPUS_MAP_WEB_URL);
    viewInCampusMapLink.appendChild(document.createTextNode('Furman Campus Map'));
    linkElements.push(viewInCampusMapLink);
  }
  writeProperty('View in', ...linkElements);

  if (type === 'VectorTileServer' && typeof data.defaultStyles === 'string') {
    const styleLink = document.createElement('a');
    const styleUrl = new URL(url.toString());
    styleUrl.pathname += '/' + data.defaultStyles + '/root.json';
    styleLink.setAttribute('href', styleUrl.toString());
    styleLink.appendChild(document.createTextNode('Default Styles'));
    writeProperty('Styles', styleLink);
    data.defaultStyles = undefined;
  }

  if (typeof data.name === 'string' || data.name === undefined) {
    const name = document.createTextNode(data.name || '');
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
