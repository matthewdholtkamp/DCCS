import fs from 'fs';
import path from 'path';

const PROJECT_ID = "glwch-dccs-2027";
const COLLECTION_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/dccs_data/dialogue/entries`;

// Helper to parse Firestore REST API value types
function parseValue(value) {
  if (value === null || value === undefined) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return parseInt(value.integerValue, 10);
  if ('doubleValue' in value) return parseFloat(value.doubleValue);
  if ('booleanValue' in value) return value.booleanValue;
  if ('nullValue' in value) return null;
  return value;
}

function parseDocument(doc) {
  const fields = doc.fields || {};
  const result = {};
  for (const key in fields) {
    result[key] = parseValue(fields[key]);
  }
  return result;
}

async function runDedupe() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  
  console.log(`Scanning dialogue entries for duplicates (mode: ${apply ? 'APPLY' : 'DRY-RUN'})...`);
  
  try {
    const response = await fetch(COLLECTION_URL);
    if (!response.ok) {
      // If collection doesn't exist yet or is empty, it might 404 or return empty
      if (response.status === 404) {
        console.log("No dialogue entries subcollection found (empty or not migrated yet).");
        return;
      }
      throw new Error(`HTTP error! status: ${response.status} - ${await response.text()}`);
    }
    
    const data = await response.json();
    const documents = data.documents || [];
    console.log(`Found ${documents.length} total entries.`);
    
    const seen = new Map();
    const duplicates = [];
    
    for (const doc of documents) {
      const docPath = doc.name;
      const docId = docPath.split('/').pop();
      const fields = parseDocument(doc);
      
      const key = `${fields.serviceLineId || ''}_${fields.date || ''}_${(fields.text || '').trim()}`;
      
      if (seen.has(key)) {
        duplicates.push({
          id: docId,
          path: docPath,
          fields
        });
      } else {
        seen.set(key, docId);
      }
    }
    
    console.log(`Detected ${duplicates.length} duplicate entries.`);
    
    if (duplicates.length === 0) {
      console.log("No duplicates found. Database is clean.");
      return;
    }
    
    for (const dup of duplicates) {
      console.log(`Duplicate: ID=${dup.id} [${dup.fields.serviceLineId}] ${dup.fields.date}: "${dup.fields.text.substring(0, 60)}..."`);
      
      if (apply) {
        console.log(`Deleting doc '${dup.id}'...`);
        const deleteUrl = `https://firestore.googleapis.com/v1/${dup.path}`;
        const delRes = await fetch(deleteUrl, { method: 'DELETE' });
        if (!delRes.ok) {
          console.error(`Failed to delete doc '${dup.id}': ${delRes.statusText}`);
        } else {
          console.log(`Deleted doc '${dup.id}' successfully.`);
        }
      }
    }
    
    if (!apply) {
      console.log("\nThis was a DRY-RUN. To delete duplicates, run this script with the --apply flag:");
      console.log("node scripts/dedupe_dialogue.mjs --apply");
    }
  } catch (error) {
    console.error("Deduplication run failed:", error);
  }
}

runDedupe();
