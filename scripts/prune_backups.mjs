import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const nightlyDir = path.join(__dirname, '..', '_backup', 'nightly');

function pruneBackups() {
  if (!fs.existsSync(nightlyDir)) {
    console.log("No nightly backup directory exists yet. Skipping pruning.");
    return;
  }

  const files = fs.readdirSync(nightlyDir);
  const dirs = files.filter(file => {
    const fullPath = path.join(nightlyDir, file);
    return fs.statSync(fullPath).isDirectory();
  });

  // Sort directories alphabetically (chronological since named YYYY-MM-DD)
  dirs.sort();

  console.log(`Found ${dirs.length} nightly backup directories.`);

  if (dirs.length > 30) {
    const toDelete = dirs.slice(0, dirs.length - 30);
    console.log(`Pruning ${toDelete.length} old backups...`);
    for (const dir of toDelete) {
      const fullPath = path.join(nightlyDir, dir);
      fs.rmSync(fullPath, { recursive: true, force: true });
      console.log(`- Deleted old backup: ${dir}`);
    }
  } else {
    console.log("No backups to prune.");
  }
}

pruneBackups();
