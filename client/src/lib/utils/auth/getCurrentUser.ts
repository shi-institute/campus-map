import z from 'zod';

export async function getCurrentUser() {
  return fetch('/rest/services', { method: 'GET', headers: { Accept: 'application/json' } }).then(
    async (response) => {
      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      const parsed = userSchema.safeParse(data.user);
      if (!parsed.success) {
        return null;
      }
      return parsed.data;
    }
  );
}

const userSchema = z.object({
  distinguishedName: z.string(),
  userPrincipalName: z.email(),
  displayName: z.string().optional(),
  employeeId: z.string().optional(),
  isGisAdmin: z.boolean().optional(),
});
