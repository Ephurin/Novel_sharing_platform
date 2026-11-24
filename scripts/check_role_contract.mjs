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

if (process.exitCode) {
  console.error('Role contract check FAILED');
} else {
  console.log('Role contract check passed: backend/web/mobile role values are in sync');
}
