
type ReturnLocation = { pathname: string; search: string; hash: string };
const authRoutes = new Set(['/login', '/dang-nhap', '/verify-email', '/xac-thuc-email']);

export function getReturnLocation(state: unknown): ReturnLocation | undefined {
  if (typeof state !== 'object' || state === null || !('returnTo' in state)) return;
  const target = state.returnTo;
  if (typeof target !== 'object' || target === null) return;
  const pathname = 'pathname' in target ? target.pathname : undefined;
  const search = 'search' in target ? target.search : undefined;
  const hash = 'hash' in target ? target.hash : undefined;
  if (typeof pathname !== 'string' || typeof search !== 'string' || typeof hash !== 'string') return;
  if ((search && !search.startsWith('?')) || (hash && !hash.startsWith('#'))) return;

  let decoded: string;
  try { decoded = decodeURIComponent(pathname); } catch { return; }
  if (!decoded.startsWith('/') || decoded.startsWith('//') || /[\\?#\u0000-\u001f\u007f]/.test(decoded)) return;
  const normalized = new URL(decoded, 'https://storycraft.invalid').pathname.replace(/\/+$/, '').toLowerCase();
  if (authRoutes.has(normalized)) return;
  return { pathname, search, hash };
}
