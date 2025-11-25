export function getKartDatabaseConnectionString(includeSchema = false) {
  const url = new URL(`postgresql://localhost:5432/kart${includeSchema ? '/data' : ''}`);
  url.username = 'campusmap';
  url.password = 'password';
  return url.toString();
}
