import fs from 'node:fs';
import path from 'node:path';

// สแกนโฟลเดอร์หาโปรเจกต์จาก marker files แล้วเดา type + suggest คำสั่งรัน
// หลักการ: อ่านของจริง (scripts ใน package.json) ไม่ hardcode command จาก framework
// เช่น React บางตัวใช้ webpack ไม่ใช่ vite — ถ้าเดามั่วจะพัง

const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.venv', 'venv', '__pycache__', 'target', 'vendor']);

// marker file → detector ที่รู้วิธีอ่านโปรเจกต์ชนิดนั้น (เรียงตามลำดับความสำคัญ)
const MARKERS = ['package.json', 'docker-compose.yml', 'compose.yml', 'docker-compose.yaml', 'build.gradle', 'build.gradle.kts', 'pom.xml', 'pyproject.toml', 'requirements.txt', 'manage.py', 'go.mod', 'Cargo.toml', 'artisan'];

export function scanFolder(rootDir, { maxDepth = 2 } = {}) {
  if (!rootDir || !fs.existsSync(rootDir) || !fs.statSync(rootDir).isDirectory()) {
    return [];
  }
  const found = [];
  walk(rootDir, 0, maxDepth, found);
  // dedupe ตาม cwd (โฟลเดอร์เดียวอาจมีหลาย marker) + เรียงตามชื่อ
  const byDir = new Map();
  for (const p of found) if (!byDir.has(p.cwd)) byDir.set(p.cwd, p);
  return [...byDir.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function walk(dir, depth, maxDepth, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // อ่านโฟลเดอร์ไม่ได้ (permission) — ข้าม
  }
  const names = new Set(entries.filter((e) => e.isFile()).map((e) => e.name));
  const detected = detectProject(dir, names);
  if (detected) out.push(detected);

  if (depth >= maxDepth) return;
  for (const entry of entries) {
    if (entry.isDirectory() && !IGNORE_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
      walk(path.join(dir, entry.name), depth + 1, maxDepth, out);
    }
  }
}

// ตัดสินว่าโฟลเดอร์นี้เป็นโปรเจกต์ไหม แล้วเดา type/command/icon
function detectProject(dir, fileNames) {
  const name = path.basename(dir);
  const has = (f) => fileNames.has(f);

  if (has('package.json')) return detectNode(dir, name);
  if (has('build.gradle') || has('build.gradle.kts')) {
    return make(dir, name, 'Spring / Gradle', './gradlew bootRun', '🍃');
  }
  if (has('pom.xml')) return make(dir, name, 'Java / Maven', './mvnw spring-boot:run', '☕');
  if (has('manage.py')) return make(dir, name, 'Django', 'python manage.py runserver', '🐍');
  if (has('pyproject.toml')) return detectPython(dir, name, true);
  if (has('requirements.txt')) return detectPython(dir, name, false);
  if (has('go.mod')) return make(dir, name, 'Go', 'go run .', '🐹');
  if (has('Cargo.toml')) return make(dir, name, 'Rust', 'cargo run', '🦀');
  if (has('artisan')) return make(dir, name, 'Laravel', 'php artisan serve', '🎯');
  if (has('docker-compose.yml') || has('compose.yml') || has('docker-compose.yaml')) {
    return make(dir, name, 'Docker Compose', 'docker compose up', '🐳');
  }
  return null;
}

// Node: อ่าน scripts จริง + เดา framework จาก deps
function detectNode(dir, name) {
  let pkg = {};
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  } catch {
    // package.json พังก็ยังถือเป็นโปรเจกต์ Node ได้ ใช้ default
  }
  const scripts = pkg.scripts ?? {};
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const dep = (re) => Object.keys(deps).some((k) => re.test(k));

  // suggest command จาก script ที่มีจริง (dev > start > serve)
  let command;
  if (scripts.dev) command = 'npm run dev';
  else if (scripts.start) command = 'npm start';
  else if (scripts.serve) command = 'npm run serve';
  else command = 'npm run dev'; // ไม่เจอ script ก็เดาไว้ก่อน user แก้ได้

  // เดา type + icon จาก deps (ไว้โชว์เฉยๆ ไม่กระทบ command)
  let type = 'Node.js';
  let icon = '🟢';
  if (dep(/^next$/)) { type = 'Next.js'; icon = '▲'; }
  else if (dep(/^vite$/) || dep(/@vitejs/)) { type = 'Vite'; icon = '⚡'; }
  else if (dep(/^@nestjs/)) { type = 'NestJS'; icon = '🐱'; }
  else if (dep(/^react$/)) { type = 'React'; icon = '⚛️'; }
  else if (dep(/^vue$/)) { type = 'Vue'; icon = '💚'; }
  else if (dep(/^express$/) || dep(/^fastify$/) || dep(/^koa$/)) { type = 'Node API'; icon = '🔌'; }

  return make(dir, name, type, command, icon);
}

function detectPython(dir, name, hasPyproject) {
  // uv เร็วและนิยมขึ้น — ถ้ามี uv.lock ใช้ uv run
  const command = fs.existsSync(path.join(dir, 'uv.lock')) ? 'uv run main.py'
    : hasPyproject ? 'python main.py'
    : 'python main.py';
  return make(dir, name, 'Python', command, '🐍');
}

function make(dir, name, type, command, icon) {
  return { name, cwd: dir, type, command, icon, port: null };
}
