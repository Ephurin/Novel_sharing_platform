import { readFileSync } from 'node:fs';

function arrayValues(source, name) {
  const match = source.match(new RegExp(`export const ${name} = \\[([^\\]]+)\\]`));
  if (!match) throw new Error(`Missing exported array ${name}`);
  return Array.from(match[1].matchAll(/'([A-Z_]+)'/g), (found) => found[1]);
}

function unionValues(source) {
  const match = source.match(/export type UserRole = ([^;\n]+);/);
  if (!match) throw new Error('Missing exported UserRole union');
  return match[1]
    .split('|')
    .map((part) => part.trim().replace(/^'|'$/g, ''))
    .filter(Boolean);
}

function checkSame(label, actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    console.error(`Role contract drift in ${label}:\n  expected ${JSON.stringify(expected)}\n  found    ${JSON.stringify(actual)}`);
    process.exitCode = 1;
  }
}

function requireSnippet(label, source, snippet) {
  const normalized = source.replace(/\r\n/g, '\n');
  if (!normalized.includes(snippet)) {
    console.error(`Role contract drift in ${label}: expected source snippet\n  ${snippet.split('\n').join('\n  ')}`);
    process.exitCode = 1;
  }
}

function roleArraysOf(source, pattern) {
  return Array.from(source.matchAll(pattern), (match) =>
    Array.from(match[1].matchAll(/'([A-Z_]+)'/g), (found) => found[1])
  );
}

const backend = readFileSync('backend/src/shared/constants/roles.ts', 'utf8');
const web = readFileSync('web/src/features/auth/auth-types.ts', 'utf8');
const mobile = readFileSync('mobile/src/api/types.ts', 'utf8');

const userRoles = arrayValues(backend, 'userRoles');
const readerCapabilityRoles = arrayValues(backend, 'readerCapabilityRoles');
const authorCapabilityRoles = arrayValues(backend, 'authorCapabilityRoles');

checkSame('web userRoles', arrayValues(web, 'userRoles'), userRoles);
checkSame('web readerCapabilityRoles', arrayValues(web, 'readerCapabilityRoles'), readerCapabilityRoles);
checkSame('web authorCapabilityRoles', arrayValues(web, 'authorCapabilityRoles'), authorCapabilityRoles);
checkSame('web UserRole union', unionValues(web), userRoles);
checkSame('mobile authorCapabilityRoles', arrayValues(mobile, 'authorCapabilityRoles'), authorCapabilityRoles);
checkSame('mobile UserRole union', unionValues(mobile), userRoles);

// Capability helpers must consult the shared arrays instead of re-encoded role literals.
requireSnippet(
  'web hasReaderCapability body',
  web,
  'return role != null && (readerCapabilityRoles as readonly UserRole[]).includes(role);'
);
requireSnippet(
  'web hasAuthorCapability body',
  web,
  'return role != null && (authorCapabilityRoles as readonly UserRole[]).includes(role);'
);
requireSnippet(
  'mobile hasAuthorCapability body',
  mobile,
  'return role != null && (authorCapabilityRoles as readonly UserRole[]).includes(role);'
);

// Guarded web routes must use the capability lists or the ADMIN-only list.
const router = readFileSync('web/src/app/router.tsx', 'utf8');
const routerGuards = roleArraysOf(router, /roles=\{\[([^\]]+)\]\}/g);
if (routerGuards.length === 0) {
  console.error('Role contract drift in web router: no RoleGuard role array found');
  process.exitCode = 1;
}
const allowedGuards = new Set([
  JSON.stringify(authorCapabilityRoles),
  JSON.stringify(readerCapabilityRoles),
  JSON.stringify(['ADMIN']),
  JSON.stringify(['MODERATOR'])
]);
for (const guard of routerGuards) {
  if (!allowedGuards.has(JSON.stringify(guard))) {
    console.error(`Role contract drift in web router roles={[${guard.join(', ')}]}: use a capability list or ['ADMIN']`);
    process.exitCode = 1;
  }
}

// The admin mount must stay behind the ADMIN-only guard.
requireSnippet(
  'admin mount guard',
  readFileSync('backend/src/modules/admin/admin.routes.ts', 'utf8'),
  "adminRoutes.use(requireAuth, requireRoles(['ADMIN']));"
);
requireSnippet(
  'account appeals guard role source',
  readFileSync('backend/src/modules/admin/account-appeals.routes.ts', 'utf8'),
  'if (!userRoles.includes(user.role))'
);

// Shell navigation shows Moderator items only together with ordinary capability anchors,
// except the moderated workspace itself which is exactly ['MODERATOR'].
const shell = readFileSync('web/src/app/layout/WebAppShell.tsx', 'utf8');
const navGuards = roleArraysOf(shell, /roles: \[([^\]]+)\]/g);
if (navGuards.length === 0) {
  console.error('Role contract drift in web shell: no nav roles array found');
  process.exitCode = 1;
}
for (const nav of navGuards) {
  if (nav.some((role) => !userRoles.includes(role))) {
    console.error(`Role contract drift in web shell nav roles [${nav.join(', ')}]: unknown role value`);
    process.exitCode = 1;
  }
  if (nav.includes('MODERATOR') && JSON.stringify(nav) !== JSON.stringify(['MODERATOR']) && !nav.some((role) => ['READER', 'AUTHOR'].includes(role))) {
    console.error(`Role contract drift in web shell nav roles [${nav.join(', ')}]: Moderator must accompany an ordinary capability anchor unless the item is exactly ['MODERATOR']`);
    process.exitCode = 1;
  }
}

// Role landing homes and the admin filter must keep deriving from the shared model.
requireSnippet(
  'web getRoleHome routing',
  readFileSync('web/src/shared/components/AuthLanding.tsx', 'utf8'),
  "function getRoleHome(role: AuthSession['user']['role']) {\n  if (role === 'ADMIN') return '/admin';\n  if (role === 'AUTHOR') return '/author';\n  return '/';\n}"
);
requireSnippet(
  'admin users role filter',
  readFileSync('web/src/features/admin/AdminUsersPage.tsx', 'utf8'),
  "{ role: ['', ...userRoles],"
);

if (process.exitCode) {
  console.error('Role contract check FAILED');
} else {
  console.log('Role contract check passed: backend/web/mobile role values are in sync');
}
