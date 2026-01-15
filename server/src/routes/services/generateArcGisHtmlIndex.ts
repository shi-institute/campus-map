import path from 'path';
import { generateServiceDirectoryHeader, unwrapServiceName } from '../../utils/index.js';
import { initDoc } from '../../utils/jsonToArcGisHtml.js';

interface IndexInput {
  currentVersion: number;
  folders?: string[];
  services: { name: string; type: string }[];
  user: Express.User | undefined;
}

interface RouteInput {
  serviceRootPathname: string;
  currentPathname: string;
}

export function generateArcGisHtmlIndex(input: IndexInput, route: RouteInput): string {
  const folder = route.currentPathname.replace(route.serviceRootPathname, '').slice(1) || '/';

  const { document, body, space, titleElement } = initDoc(`Folder: ${folder}`);

  // write header
  const headerTables = generateServiceDirectoryHeader(
    {
      document,
      user: input.user,
      formats: [
        { format: 'json', href: `?f=json` },
        { format: 'pjson', href: `?f=pjson` },
      ],
    },
    route
  );
  headerTables.forEach((table) => body.appendChild(table));
  body.appendChild(titleElement);

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
      link.setAttribute('href', encodeURI(path.join(route.currentPathname, folder)));
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

      link.setAttribute(
        'href',
        encodeURI(path.join(route.currentPathname, `${service.name}/${service.type}`))
      );

      const serviceName = unwrapServiceName(service.name);
      link.appendChild(document.createTextNode(`${serviceName} (${service.type})`));

      li.appendChild(link);
      servicesList.appendChild(li);
    });
    writeProperty('Services', false, servicesList);
  }

  return document.toString();
}
