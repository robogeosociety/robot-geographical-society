import fs from 'fs';
import path from 'path';
export function getViteConfigPath(projectDir) {
  const tsPath = path.join(projectDir, 'vite.config.ts');
  const jsPath = path.join(projectDir, 'vite.config.js');
  return fs.existsSync(tsPath) ? tsPath : fs.existsSync(jsPath) ? jsPath : null;
}
export function getViteBase(projectDir) {
  const configPath = getViteConfigPath(projectDir);
  if (!configPath) return '/';
  const content = fs.readFileSync(configPath, 'utf-8');
  const match = content.match(/base:\s*['"](.*?)['"]/);
  return match ? (match[1].endsWith('/') ? match[1] : match[1] + '/') : '/';
}
export function ensureViteAllowedHost(projectDir, hostname) {
  const configPath = getViteConfigPath(projectDir);
  if (!configPath) return;
  let content = fs.readFileSync(configPath, 'utf-8');
  if (content.includes(hostname)) return;
  if (content.includes('allowedHosts:')) {
    content = content.replace(/allowedHosts:\s*\[/, `allowedHosts: [\"${hostname}\", `);
  } else if (content.includes('server: {')) {
    content = content.replace('server: {', `server: {\\n    allowedHosts: [\"${hostname}\"],`);
  }
  fs.writeFileSync(configPath, content);
}
