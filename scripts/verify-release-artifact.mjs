import { readFileSync, readdirSync, lstatSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
// web-ext 自身と同じ ZIP reader を使う。依存の追加はしない。
const JSZip = createRequire(require.resolve('web-ext'))('jszip');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const check = (condition, message) => { if (!condition) throw new Error(`ARTIFACT_GUARD_REJECTED: ${message}`); };
const json = file => JSON.parse(readFileSync(path.join(root, file), 'utf8'));

export function verifySource() {
  const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  check(process.env.RELEASE_SOURCE_SHA === sourceSha, 'release source SHA mismatch or missing');
  const chrome = json('manifest.json');
  const firefox = json('manifest.firefox.json');
  const version = chrome.version;
  check(process.env.RELEASE_REF_NAME === `release/${version}`, 'release branch/version mismatch');
  check(firefox.version === version && json('package.json').version === version, 'manifest/package versions differ');
  execFileSync('git', ['diff', '--exit-code', 'HEAD', '--', 'manifest.json', 'manifest.firefox.json', 'package.json', 'src', 'icons/icon.svg'], { cwd: root, stdio: 'pipe' });
  check(chrome.manifest_version === 3 && chrome.background?.service_worker === 'src/background/background.js' && !chrome.background.scripts, 'invalid Chrome background');
  check(firefox.manifest_version === 3 && !firefox.background?.service_worker && JSON.stringify(firefox.background?.scripts) === '["src/background/background.js"]', 'invalid Firefox background');
  const gecko = firefox.browser_specific_settings?.gecko;
  check(gecko?.id === '{a4a7df25-9281-44f6-9d06-5959599c6473}' && gecko.strict_min_version === '142.0', 'invalid Firefox identity/minimum version');
  check(JSON.stringify(gecko.data_collection_permissions?.required) === '["none"]', 'invalid Firefox data permissions');
  return { sourceSha, version };
}

function sourceFiles(dir, prefix = '') {
  const files = new Map();
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (/\.DS_Store$|\.swp$|~$/.test(entry.name)) continue;
    const full = path.join(dir, entry.name);
    check(!lstatSync(full).isSymbolicLink(), `symbolic link in source: ${prefix}${entry.name}`);
    if (entry.isDirectory()) {
      for (const [name, data] of sourceFiles(full, `${prefix}${entry.name}/`)) files.set(name, data);
    } else {
      check(entry.isFile(), `non-file in source: ${full}`);
      files.set(`${prefix}${entry.name}`, readFileSync(full));
    }
  }
  return files;
}

export async function verifyArtifact(archivePath, variant) {
  const release = verifySource();
  check(['chrome', 'firefox'].includes(variant), 'unknown variant');
  const absolutePath = path.resolve(archivePath);
  const bytes = readFileSync(absolutePath);
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true, createFolders: false });
  // JSZip は同名 entry を上書きするため、central directory の件数とも照合する。
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65557) && !(bytes.readUInt32LE(end) === 0x06054b50 && end + 22 + bytes.readUInt16LE(end + 20) === bytes.length)) end--;
  check(end >= 0 && bytes.readUInt32LE(end) === 0x06054b50 && bytes.readUInt16LE(end + 4) === 0 && bytes.readUInt16LE(end + 6) === 0, 'invalid or multi-disk ZIP');
  check(bytes.readUInt16LE(end + 10) === Object.keys(zip.files).length, 'duplicate entries or unsupported ZIP64');
  const expected = new Map([['manifest.json', readFileSync(path.join(root, variant === 'chrome' ? 'manifest.json' : 'manifest.firefox.json'))]]);
  for (const folder of ['icons', 'src']) for (const [name, data] of sourceFiles(path.join(root, folder), `${folder}/`)) expected.set(name, data);
  for (const required of ['icons/icon.svg', 'icons/icon-16.png', 'icons/icon-48.png', 'icons/icon-128.png', 'src/background/background.js']) check(expected.has(required), `missing required source: ${required}`);
  const hashes = {};
  for (const [name, entry] of Object.entries(zip.files)) {
    check(entry.unsafeOriginalName === undefined || entry.unsafeOriginalName === name, 'unsafe ZIP entry');
    check(!name.includes('\\') && !name.split('/').some(part => part === '..' || part === '.'), 'unsafe ZIP path');
    if (entry.dir) {
      check(/^(icons|src)\//.test(name), `unexpected directory: ${name}`);
      continue;
    }
    check(expected.has(name), `unexpected file: ${name}`);
    const data = await entry.async('nodebuffer');
    check(data.equals(expected.get(name)), `source bytes mismatch: ${name}`);
    hashes[name] = sha256(data);
    expected.delete(name);
  }
  check(expected.size === 0, `missing files: ${[...expected.keys()].join(', ')}`);
  const record = { ...release, variant, path: absolutePath, sha256: sha256(bytes), node: process.version, signature: 'unsigned store submission; store signs separately', files: hashes };
  console.log(JSON.stringify(record));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n\`\`\`json\n${JSON.stringify(record, null, 2)}\n\`\`\`\n`);
  return record;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === 'source') console.log(JSON.stringify(verifySource()));
  else await verifyArtifact(process.argv[3], process.argv[2]);
}
