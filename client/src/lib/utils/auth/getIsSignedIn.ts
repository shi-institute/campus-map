export async function getIsSignedIn() {
  return fetch('/rest/services', { method: 'GET', headers: { Accept: 'application/json' } }).then(
    async (response) => {
      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      return !!data.user?.userPrincipalName;
    }
  );
}
