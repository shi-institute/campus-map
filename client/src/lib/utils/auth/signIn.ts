export async function signIn({ username, password }: { username: string; password: string }) {
  await fetch('/rest/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ username, password }),
  }).then(async (response) => {
    if (!response.ok) {
      // check if there is an error message in the response
      if (response.headers.get('Content-Type')?.includes('application/json')) {
        const data = await response.json();
        throw new Error(data.error || 'Sign in failed.');
      } else {
        throw new Error('Sign in failed.');
      }
    }

    // successful sign in
    return response.json();
  });
}
