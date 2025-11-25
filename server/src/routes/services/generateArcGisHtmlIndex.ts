import { DOMParser } from '@xmldom/xmldom';
import path from 'path';
import { constants } from '../../utils/constants.js';
import { arcGisCss } from '../../utils/jsonToArcGisHtml.js';

interface IndexInput {
  currentVersion: number;
  folders?: string[];
  services: { name: string; type: string }[];
}

interface RouteInput {
  serviceRootPathname: string;
  currentPathname: string;
}

export function generateArcGisHtmlIndex(input: IndexInput, route: RouteInput): string {
  const document = new DOMParser().parseFromString(
    '<!DOCTYPE html><html><head></head><body></body></html>',
    'text/html'
  );
  const head = document.getElementsByTagName('head')[0];
  if (!head) return '';
  const body = document.getElementsByTagName('body')[0];
  if (!body) return '';

  const titleText = `Folder: /`;

  const space = () => document.createTextNode('\u00A0\u00A0');

  // write head
  const title = document.createElement('title');
  title.appendChild(document.createTextNode(titleText));
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
  homeLink.setAttribute('href', route.serviceRootPathname);
  homeLink.appendChild(document.createTextNode('Home'));
  breadcrumbsCell.appendChild(homeLink);
  breadcrumbsCell.appendChild(document.createTextNode(' > '));
  const servicesLink = document.createElement('a');
  servicesLink.setAttribute('href', route.serviceRootPathname);
  servicesLink.appendChild(document.createTextNode('Services'));
  breadcrumbsCell.appendChild(servicesLink);
  breadcrumbsRow.appendChild(breadcrumbsCell);
  navTable.appendChild(breadcrumbsRow);
  body.appendChild(navTable);

  // write breadcrumbs for current path
  if (route.currentPathname !== route.serviceRootPathname) {
    const pathParts = route.currentPathname
      .replace(route.serviceRootPathname, '')
      .split('/')
      .filter((part) => part.length > 0);
    let cumulativePath = route.serviceRootPathname;
    pathParts.forEach((part, index) => {
      cumulativePath += `/${part}`;
      const separator = document.createTextNode(' > ');
      breadcrumbsCell.appendChild(separator);
      const partLink = document.createElement('a');
      partLink.setAttribute('href', cumulativePath);
      partLink.appendChild(document.createTextNode(part));
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
  h2.appendChild(document.createTextNode(titleText));
  body.appendChild(h2);

  // properties div
  const propertiesDiv = document.createElement('div');
  propertiesDiv.setAttribute('class', 'rbody');
  body.appendChild(propertiesDiv);

  function writeProperty(label: string, includeBreak: boolean, ...elements: (Element | Node)[]) {
    const b = document.createElement('b');
    b.appendChild(document.createTextNode(label + ': '));
    propertiesDiv.appendChild(b);
    propertiesDiv.appendChild(space());
    elements.forEach((element, index) => {
      propertiesDiv.appendChild(element);
      if (index < elements.length - 1 || includeBreak) {
        propertiesDiv.appendChild(space());
        propertiesDiv.appendChild(space());
      }
    });
    if (includeBreak) {
      propertiesDiv.appendChild(document.createElement('br'));
      propertiesDiv.appendChild(document.createElement('br'));
    }
  }

  // current version
  const currentVersion = document.createTextNode(input.currentVersion.toString());
  writeProperty('Current Version', true, currentVersion);

  // folders
  if (input.folders?.length) {
    const foldersList = document.createElement('ul');
    input.folders.forEach((folder) => {
      const li = document.createElement('li');
      const link = document.createElement('a');
      link.setAttribute('href', path.join(route.currentPathname, folder));
      link.appendChild(document.createTextNode(folder));
      li.appendChild(link);
      foldersList.appendChild(li);
    });
    writeProperty('Folders', false, foldersList);
  }

  // services
  if (input.services.length) {
    const servicesList = document.createElement('ul');
    input.services.forEach((service) => {
      const li = document.createElement('li');
      const link = document.createElement('a');
      link.setAttribute('href', path.join(route.currentPathname, `${service.name}/${service.type}`));
      link.appendChild(document.createTextNode(`${service.name} (${service.type})`));
      li.appendChild(link);
      servicesList.appendChild(li);
    });
    writeProperty('Services', false, servicesList);
  }

  return document.toString();
}
