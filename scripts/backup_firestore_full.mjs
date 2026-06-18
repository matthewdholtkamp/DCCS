import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ID = 'glwch-dccs-2027';
const ROOT_COLLECTION = 'dccs_data';
const API_ROOT = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const TOP_LEVEL_DOCS = ['tasks', 'hedis', 'er_data', 'metrics', 'dialogue', '_meta', 'audit'];
const SUBCOLLECTIONS = [
  ['metrics', 'series'],
  ['dialogue', 'entries'],
  ['audit', 'events']
];

function parseValue(value) {
  if (value === null || value === undefined) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return parseInt(value.integerValue, 10);
  if ('doubleValue' in value) return parseFloat(value.doubleValue);
  if ('booleanValue' in value) return value.booleanValue;
  if ('nullValue' in value) return null;
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(parseValue);
  if ('mapValue' in value) {
    const fields = value.mapValue.fields || {};
    return Object.fromEntries(Object.entries(fields).map(([key, val]) => [key, parseValue(val)]));
  }
  return value;
}

function parseDocument(doc) {
  const fields = doc.fields || {};
  return Object.fromEntries(Object.entries(fields).map(([key, val]) => [key, parseValue(val)]));
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function safeDocId(docName) {
  return docName.split('/').pop();
}

function writeJson(filePath, data) {
  const serialized = JSON.stringify(data, null, 2) + '\n';
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, serialized);
  return {
    bytes: Buffer.byteLength(serialized),
    sha256: sha256(serialized)
  };
}

async function fetchJson(url, optional = false) {
  const response = await fetch(url);
  if (optional && response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}: ${await response.text()}`);
  }
  return response.json();
}

async function fetchDocument(docId) {
  const encoded = encodeURIComponent(docId);
  return fetchJson(`${API_ROOT}/${ROOT_COLLECTION}/${encoded}`, true);
}

async function fetchCollection(collectionPath) {
  const docs = [];
  let pageToken = null;

  do {
    const url = new URL(`${API_ROOT}/${collectionPath}`);
    url.searchParams.set('pageSize', '300');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const data = await fetchJson(url.toString(), true);
    if (!data) break;
    docs.push(...(data.documents || []));
    pageToken = data.nextPageToken || null;
  } while (pageToken);

  return docs;
}

async function runBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dirName = process.env.BACKUP_DIR_NAME || `full-${timestamp}`;
  const backupDir = path.join(__dirname, '..', '_backup', dirName);

  const manifest = {
    generatedAt: new Date().toISOString(),
    projectId: PROJECT_ID,
    rootCollection: ROOT_COLLECTION,
    backupDir,
    topLevel: [],
    subcollections: [],
    totals: {
      topLevelDocuments: 0,
      subcollectionDocuments: 0,
      bytes: 0
    }
  };

  console.log(`Starting full Firestore backup for '${PROJECT_ID}'...`);
  console.log(`Saving backup files to: ${backupDir}`);

  for (const docId of TOP_LEVEL_DOCS) {
    const doc = await fetchDocument(docId);
    if (!doc) {
      manifest.topLevel.push({ path: `${ROOT_COLLECTION}/${docId}`, exists: false });
      console.log(`- Skipped missing top-level doc '${docId}'`);
      continue;
    }

    const parsed = parseDocument(doc);
    const relativeFile = path.join('top-level', `${docId}.json`);
    const filePath = path.join(backupDir, relativeFile);
    const stats = writeJson(filePath, parsed);

    manifest.topLevel.push({
      path: `${ROOT_COLLECTION}/${docId}`,
      id: docId,
      exists: true,
      file: relativeFile,
      ...stats
    });
    manifest.totals.topLevelDocuments += 1;
    manifest.totals.bytes += stats.bytes;
    console.log(`- Backed up top-level doc '${docId}'`);
  }

  for (const [parentDoc, collectionId] of SUBCOLLECTIONS) {
    const collectionPath = `${ROOT_COLLECTION}/${parentDoc}/${collectionId}`;
    const docs = await fetchCollection(collectionPath);
    const entries = [];

    for (const doc of docs) {
      const docId = safeDocId(doc.name);
      const parsed = parseDocument(doc);
      const relativeFile = path.join('subcollections', parentDoc, collectionId, `${docId}.json`);
      const filePath = path.join(backupDir, relativeFile);
      const stats = writeJson(filePath, parsed);

      entries.push({
        path: `${collectionPath}/${docId}`,
        id: docId,
        file: relativeFile,
        ...stats
      });
      manifest.totals.subcollectionDocuments += 1;
      manifest.totals.bytes += stats.bytes;
    }

    manifest.subcollections.push({
      path: collectionPath,
      count: entries.length,
      documents: entries
    });
    console.log(`- Backed up subcollection '${collectionPath}' (${entries.length} docs)`);
  }

  const manifestStats = writeJson(path.join(backupDir, '_manifest.json'), manifest);
  console.log(`Full Firestore backup completed: ${backupDir}`);
  console.log(`Manifest SHA-256: ${manifestStats.sha256}`);
}

runBackup().catch((error) => {
  console.error('Full Firestore backup failed:', error);
  process.exit(1);
});
