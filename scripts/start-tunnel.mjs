/**
 * Public tunnel for local API (Cloudflare quick tunnel).
 * npm-ngrok is often blocked by Windows Defender — cloudflared is the reliable option.
 *
 * Usage:
 *   npm run tunnel          # assumes API already on PORT (default 5000)
 *   npm run dev:tunnel      # via concurrently from package.json
 */
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const port = Number(process.env.PORT) || 5000;
const candidates = [
  process.env.CLOUDFLARED_PATH,
  'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
  'C:\\Program Files\\cloudflared\\cloudflared.exe',
  'cloudflared',
].filter(Boolean);

const resolveBin = () => {
  for (const c of candidates) {
    if (c === 'cloudflared') return c;
    if (fs.existsSync(c)) return c;
  }
  return null;
};

const bin = resolveBin();
if (!bin) {
  console.error(
    'cloudflared not found. Install: winget install Cloudflare.cloudflared'
  );
  process.exit(1);
}

console.log(`\nStarting public tunnel → http://localhost:${port}`);
console.log(`Using: ${bin}\n`);

const child = spawn(bin, ['tunnel', '--url', `http://localhost:${port}`], {
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});

const printUrl = (chunk) => {
  const text = chunk.toString();
  process.stderr.write(text);
  const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
  if (match) {
    console.log('\n========================================');
    console.log('  PUBLIC API URL (share with mobile app)');
    console.log(`  ${match[0]}`);
    console.log(`  Health: ${match[0]}/health`);
    console.log('========================================\n');
  }
};

child.stdout.on('data', printUrl);
child.stderr.on('data', printUrl);

child.on('exit', (code) => {
  console.log(`Tunnel exited with code ${code}`);
  process.exit(code ?? 0);
});

process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
