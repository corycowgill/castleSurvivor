/**
 * Write the build number into index.html.
 *
 * The game is a static index.html with no build step, so the only place a
 * version can come from is the commit itself. .githooks/pre-commit runs this
 * before every commit and re-stages the file, which means the number on the
 * title screen always identifies the commit it shipped in -- readable off a
 * screenshot or a photo of a phone, which is how most bug reports arrive here.
 *
 *   node tools/stamp-build.mjs           stamp for the commit being made
 *   node tools/stamp-build.mjs --check    print what it would write, change nothing
 *
 * The number is the commit count this commit will produce: HEAD count + 1. It
 * only ever goes up, and it matches `git rev-list --count <sha>` afterwards.
 */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'index.html');
const CHECK = process.argv.includes('--check');

function git(...args) {
  try { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim(); }
  catch { return ''; }
}

// HEAD + 1 = the commit about to be created. On an empty repo rev-list fails
// and the first commit is build 1.
const count = parseInt(git('rev-list', '--count', 'HEAD'), 10);
const number = (Number.isFinite(count) ? count : 0) + 1;
const date = new Date().toISOString().slice(0, 10);

const line = `const BUILD = { number: ${number}, date: '${date}' };`;
const re = /\/\* BUILD:START \*\/[\s\S]*?\/\* BUILD:END \*\//;

const src = fs.readFileSync(FILE, 'utf8');
if (!re.test(src)) {
  console.error('stamp-build: BUILD:START / BUILD:END markers not found in index.html');
  process.exit(1);
}

const nl = src.includes('\r\n') ? '\r\n' : '\n';
const block = `/* BUILD:START */${nl}${line}${nl}/* BUILD:END */`;
const out = src.replace(re, block);

if (CHECK) { console.log(line); process.exit(0); }
if (out === src) { console.log(`build ${number} (unchanged)`); process.exit(0); }
fs.writeFileSync(FILE, out);
console.log(`build ${number} (${date})`);
