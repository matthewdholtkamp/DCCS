import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ID = "glwch-dccs-2027";
const DATABASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/dccs_data`;

// Helper to parse Firestore REST API value types back to standard JS values
function parseValue(value) {
  if (value === null || value === undefined) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return parseInt(value.integerValue, 10);
  if ('doubleValue' in value) return parseFloat(value.doubleValue);
  if ('booleanValue' in value) return value.booleanValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) {
    const values = value.arrayValue.values || [];
    return values.map(parseValue);
  }
  if ('mapValue' in value) {
    const fields = value.mapValue.fields || {};
    const result = {};
    for (const key in fields) {
      result[key] = parseValue(fields[key]);
    }
    return result;
  }
  if ('timestampValue' in value) return value.timestampValue;
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

async function runBackup() {
  console.log(`Starting backup of Firestore project '${PROJECT_ID}'...`);
  
  try {
    const response = await fetch(DATABASE_URL);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status} - ${await response.text()}`);
    }
    
    const data = await response.json();
    if (!data.documents || !Array.isArray(data.documents)) {
      throw new Error("No documents found or invalid format returned from Firestore.");
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dirName = process.env.BACKUP_DIR_NAME || timestamp;
    const backupDir = path.join(__dirname, '..', '_backup', dirName);
    
    fs.mkdirSync(backupDir, { recursive: true });
    console.log(`Saving backup files to directory: ${backupDir}`);
    
    for (const doc of data.documents) {
      const docPath = doc.name;
      const docId = docPath.split('/').pop();
      const parsedData = parseDocument(doc);
      
      const fileDest = path.join(backupDir, `${docId}.json`);
      fs.writeFileSync(fileDest, JSON.stringify(parsedData, null, 2));
      console.log(`- Backed up document '${docId}' to ${fileDest}`);
    }
    
    console.log("Firestore backup completed successfully!");
  } catch (error) {
    console.error("Backup failed:", error);
    process.exit(1);
  }
}

runBackup();
