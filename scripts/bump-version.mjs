import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const BUMP_TYPES = new Set(['major', 'minor', 'patch']);

const files = {
  rootPackage: path.join(repoRoot, 'package.json'),
  rootLock: path.join(repoRoot, 'package-lock.json'),
  serverPackage: path.join(repoRoot, 'server', 'package.json'),
  serverLock: path.join(repoRoot, 'server', 'package-lock.json'),
  mcpPackage: path.join(repoRoot, 'mcp-server', 'package.json'),
  mcpLock: path.join(repoRoot, 'mcp-server', 'package-lock.json'),
  mcpEntry: path.join(repoRoot, 'mcp-server', 'src', 'index.ts'),
};

function usage() {
  return [
    'Usage: npm run version:bump -- <major|minor|patch|x.y.z|sync>',
    '',
    'Examples:',
    '  npm run version:patch',
    '  npm run version:minor',
    '  npm run version:bump -- 1.3.0',
    '  npm run version:sync',
  ].join('\n');
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function parseVersion(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-.+)?$/);
  if (!match) {
    throw new Error(`Unsupported version "${version}". Expected x.y.z.`);
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function bumpVersion(current, bumpType) {
  const version = parseVersion(current);

  if (bumpType === 'major') {
    version.major += 1;
    version.minor = 0;
    version.patch = 0;
  } else if (bumpType === 'minor') {
    version.minor += 1;
    version.patch = 0;
  } else {
    version.patch += 1;
  }

  return `${version.major}.${version.minor}.${version.patch}`;
}

function resolveTargetVersion(current, input) {
  if (!input) {
    throw new Error(`Missing version bump.\n\n${usage()}`);
  }

  if (input === 'sync') {
    return current;
  }

  if (BUMP_TYPES.has(input)) {
    return bumpVersion(current, input);
  }

  if (VERSION_PATTERN.test(input)) {
    return input;
  }

  throw new Error(`Invalid version bump "${input}".\n\n${usage()}`);
}

function setPackageVersion(filePath, version) {
  const json = readJson(filePath);
  json.version = version;
  writeJson(filePath, json);
}

function setPackageLockVersion(filePath, packagePath, version) {
  const json = readJson(filePath);
  json.version = version;

  if (json.packages?.['']) {
    json.packages[''].version = version;
  }

  if (packagePath && json.packages?.[packagePath]) {
    json.packages[packagePath].version = version;
  }

  writeJson(filePath, json);
}

function setMcpRuntimeVersion(version) {
  const source = readFileSync(files.mcpEntry, 'utf8');
  const updated = source.replace(
    /(version:\s*)['"]\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?['"]/,
    `$1'${version}'`,
  );

  if (updated === source) {
    throw new Error(`Could not find MCP runtime version in ${path.relative(repoRoot, files.mcpEntry)}.`);
  }

  writeFileSync(files.mcpEntry, updated);
}

try {
  const input = process.argv[2];
  if (input === '--help' || input === '-h') {
    console.log(usage());
    process.exit(0);
  }

  const current = readJson(files.mcpPackage).version;
  const target = resolveTargetVersion(current, input);

  for (const filePath of [files.rootPackage, files.serverPackage, files.mcpPackage]) {
    setPackageVersion(filePath, target);
  }

  setPackageLockVersion(files.rootLock, 'mcp-server', target);
  setPackageLockVersion(files.rootLock, 'server', target);
  setPackageLockVersion(files.serverLock, null, target);
  setPackageLockVersion(files.mcpLock, null, target);
  setMcpRuntimeVersion(target);

  console.log(`Kaleidoscope version set to ${target}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
