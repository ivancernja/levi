export function getBaseURL(): string {
  if (process.env.BETTER_AUTH_URL) {
    const url = process.env.BETTER_AUTH_URL;
    return url.startsWith("http") ? url : `https://${url}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
}
