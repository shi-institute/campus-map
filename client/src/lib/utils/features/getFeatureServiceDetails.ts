export async function getFeatureServiceDetails(servicePath: string) {
  const url = `/rest/services/${servicePath}/FeatureServer/0?f=json`;

  const data = await fetch(url, { method: 'GET', credentials: 'include' }).then((res) => res.json());

  if (!data || !data.name || !data.fields) {
    return null;
  }

  return { name: data.name as string, geometryType: data.geometryType as string };
}
