const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CONFIG_FILE = 'default-config.json';

function runGit(command) {
  try {
    return execSync(`git ${command}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    return '';
  }
}

function getPreviousRef() {
  const explicitRef = process.env.PREVIOUS_RELEASE_REF;
  if (explicitRef) return explicitRef;

  const tagCandidates = [
    'describe --tags --abbrev=0 HEAD^',
    'describe --tags --abbrev=0 HEAD~1',
  ];

  for (const cmd of tagCandidates) {
    const tag = runGit(cmd);
    if (tag) return tag;
  }

  const refs = ['HEAD~1', 'HEAD^', 'origin/main', 'main', 'master'];
  for (const ref of refs) {
    const result = runGit(`rev-parse --verify ${ref}`);
    if (result) return ref;
  }

  return null;
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid JSON in ${filePath}: ${error.message}`);
  }
}

function flattenJson(value, prefix = '') {
  const result = {};

  if (Array.isArray(value)) {
    result[prefix] = value;
    return result;
  }

  if (value && typeof value === 'object') {
    for (const [key, nestedValue] of Object.entries(value)) {
      const nextKey = prefix ? `${prefix}.${key}` : key;
      if (nestedValue !== null && typeof nestedValue === 'object' && !Array.isArray(nestedValue)) {
        Object.assign(result, flattenJson(nestedValue, nextKey));
      } else {
        result[nextKey] = nestedValue;
      }
    }
    return result;
  }

  result[prefix] = value;
  return result;
}

function normalizeValue(value) {
  if (value !== null && typeof value === 'object') {
    return JSON.stringify(value, Object.keys(value).sort());
  }
  return value;
}

function compareConfigData(oldData, newData) {
  const oldFlat = flattenJson(oldData);
  const newFlat = flattenJson(newData);

  const added = Object.keys(newFlat)
    .filter((key) => !(key in oldFlat))
    .sort();

  const removed = Object.keys(oldFlat)
    .filter((key) => !(key in newFlat))
    .sort();

  const changed = [];
  for (const key of Object.keys(oldFlat).filter((item) => item in newFlat).sort()) {
    if (normalizeValue(oldFlat[key]) !== normalizeValue(newFlat[key])) {
      changed.push(`${key}: ${JSON.stringify(oldFlat[key])} -> ${JSON.stringify(newFlat[key])}`);
    }
  }

  return { added, removed, changed };
}

function compareConfig() {
  const configPath = path.resolve(process.cwd(), CONFIG_FILE);
  if (!fs.existsSync(configPath)) {
    throw new Error(`${CONFIG_FILE} not found in ${process.cwd()}`);
  }

  const currentData = readJson(configPath);
  const previousRef = getPreviousRef();

  if (!previousRef) {
    return {
      ok: true,
      message: `No previous ${CONFIG_FILE} found to compare against. This is likely the first commit or the previous file does not exist in the current checkout.`,
      added: [],
      removed: [],
      changed: [],
    };
  }

  let previousRaw = '';
  try {
    previousRaw = execSync(`git show ${previousRef}:${CONFIG_FILE}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    return {
      ok: true,
      message: `No previous ${CONFIG_FILE} found at ${previousRef}.`,
      added: [],
      removed: [],
      changed: [],
    };
  }

  const previousData = JSON.parse(previousRaw);
  const diff = compareConfigData(previousData, currentData);

  return {
    ok: diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0,
    previousRef,
    added: diff.added,
    removed: diff.removed,
    changed: diff.changed,
  };
}

function printReport(result) {
  console.log(`Comparing ${CONFIG_FILE} against previous revision...`);
  console.log('\nAdded keys');
  if (result.added.length === 0) console.log('- None');
  else result.added.forEach((item) => console.log(`- ${item}`));

  console.log('\nRemoved keys');
  if (result.removed.length === 0) console.log('- None');
  else result.removed.forEach((item) => console.log(`- ${item}`));

  console.log('\nChanged values');
  if (result.changed.length === 0) console.log('- None');
  else result.changed.forEach((item) => console.log(`- ${item}`));

  if (result.ok) {
    console.log('\nNo differences detected between current config and previous release.');
    return 0;
  }

  console.log('\nCONFIG CHANGED: values or keys differ from the previous release.');
  return 1;
}

if (require.main === module) {
  try {
    const result = compareConfig();
    if (result.message) {
      console.log(result.message);
      process.exit(0);
    }
    process.exit(printReport(result));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = { compareConfig, compareConfigData, flattenJson };
