import fs from 'fs';
import path from 'path';
export function findPythonEntry(projectDir) {
  const commonEntries = ['server.py', 'app.py', 'main.py', 'api.py'];
  for (const entry of commonEntries) {
    if (fs.existsSync(path.join(projectDir, entry))) return entry;
  }
  return null;
}
export function getPythonBinary(projectDir) {
  const venvPath = path.join(projectDir, '.venv', 'bin', 'python');
  return fs.existsSync(venvPath) ? venvPath : 'python3';
}
