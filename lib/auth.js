export function requireAuth(req) {
  const header = req.headers.authorization || '';
  const token = header.replace('Bearer ', '');

  if (!token || token !== process.env.BACKEND_TOKEN) {
    throw new Error('Unauthorized');
  }
}
