import { knownServiceTypes } from '../routes/services/discoverServices.js';
import { constants } from './constants.js';

interface HeaderInput {
  document: Document;
  user: Express.User | undefined;
  formats?: { format: string; href: string }[];
}

interface RouteInput {
  serviceRootPathname: string;
  currentPathname: string;
}

export function generateServiceDirectoryHeader({ document, user, formats }: HeaderInput, route: RouteInput) {
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

  const rightCell = document.createElement('td');
  rightCell.setAttribute('align', 'right');
  headerRow.appendChild(rightCell);
  if (user) {
    const userText = document.createTextNode(`Signed in user: ${user.userPrincipalName} | `);
    const logoutLink = document.createElement('a');
    logoutLink.setAttribute('href', '/rest/logout');
    logoutLink.setAttribute('data-no-token', '');
    logoutLink.appendChild(document.createTextNode('Logout'));
    rightCell.appendChild(userText);
    rightCell.appendChild(logoutLink);
  } else {
    const loginLink = document.createElement('a');
    loginLink.setAttribute('href', '/rest/login');
    loginLink.setAttribute('data-no-token', '');
    loginLink.appendChild(document.createTextNode('Sign in'));
    rightCell.appendChild(loginLink);
  }

  const getTokenLink = document.createElement('a');
  getTokenLink.setAttribute('href', '/tokens');
  getTokenLink.setAttribute('data-no-token', '');
  getTokenLink.appendChild(document.createTextNode('Get Token'));
  rightCell.appendChild(document.createTextNode(' | '));
  rightCell.appendChild(getTokenLink);

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
  if (route.currentPathname.startsWith(route.serviceRootPathname)) {
    breadcrumbsCell.appendChild(document.createTextNode(' > '));
    const servicesLink = document.createElement('a');
    servicesLink.setAttribute('href', route.serviceRootPathname);
    servicesLink.appendChild(document.createTextNode('Services'));
    breadcrumbsCell.appendChild(servicesLink);
  }
  breadcrumbsRow.appendChild(breadcrumbsCell);
  navTable.appendChild(breadcrumbsRow);

  // write breadcrumbs for current path
  if (
    route.currentPathname.startsWith(route.serviceRootPathname) &&
    route.currentPathname !== route.serviceRootPathname
  ) {
    const pathParts = route.currentPathname
      .replace(route.serviceRootPathname, '')
      .split('/')
      .filter((part) => part.length > 0)
      .map((part) => decodeURIComponent(part));

    let cumulativePath = route.serviceRootPathname;
    const partLinks = pathParts.reduce((acc, part) => {
      cumulativePath += `/${part}`;

      if ((knownServiceTypes as readonly string[]).includes(part)) {
        const previousPartElem = acc.pop();
        const previousPartElemTextNode = previousPartElem?.firstChild;
        if (previousPartElemTextNode && previousPartElemTextNode.nodeType === previousPartElem.TEXT_NODE) {
          const modifiedPartTextNode = document.createTextNode(previousPartElem.textContent + ` (${part})`);
          previousPartElem.replaceChild(modifiedPartTextNode, previousPartElemTextNode);
          previousPartElem.setAttribute('href', encodeURI(cumulativePath));
          return [...acc, previousPartElem];
        }
      }

      const partLink = document.createElement('a');
      partLink.setAttribute('href', encodeURI(cumulativePath));
      partLink.appendChild(document.createTextNode(part));
      return [...acc, partLink];
    }, [] as HTMLAnchorElement[]);

    partLinks.forEach((partLink, index) => {
      const separator = document.createTextNode(' > ');
      breadcrumbsCell.appendChild(separator);
      breadcrumbsCell.appendChild(partLink);
    });
  }

  // write formats if provided
  if (formats) {
    const formatsTable = document.createElement('table');
    const formatsRow = document.createElement('tr');
    const formatsCell = document.createElement('td');
    formatsCell.setAttribute('class', 'apiref');

    formats.forEach((formatObj, index) => {
      const formatLink = document.createElement('a');
      formatLink.setAttribute('href', formatObj.href);
      formatLink.appendChild(document.createTextNode(formatObj.format.toUpperCase()));
      formatsCell.appendChild(formatLink);

      // add separator if not last
      if (index < formats.length - 1) {
        formatsCell.appendChild(document.createTextNode(' | '));
      }
    });

    formatsRow.appendChild(formatsCell);
    formatsTable.appendChild(formatsRow);
    navTable.appendChild(formatsTable);
  }

  return [headerTable, navTable];
}
