// Проверка нейтральной сборки: в dist не должно быть ни названия партнёра, ни его бонусной карты, ни файла логотипа.
//   VITE_NEUTRAL=1 npx vite build && node scripts/check-neutral.mjs dist
// Названия записаны кодами символов, чтобы их не было и в тексте самого скрипта.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const cp = (...c) => String.fromCodePoint(...c);
const BANNED = [
  { what: 'название партнёра', re: new RegExp(`${cp(0x41f, 0x44f, 0x442)}[её]${cp(0x440, 0x43e, 0x447, 0x43a)}`, 'i') },
  { what: 'бонусная карта партнёра', re: new RegExp(`${cp(0x412, 0x44b, 0x440, 0x443, 0x447, 0x430, 0x439)}[- ]${cp(0x43a, 0x430, 0x440, 0x442)}`, 'i') },
  { what: 'файл брендового логотипа', re: /logo-5\.svg/ },
];

const dir = process.argv[2] || 'dist';
const TEXT = /\.(html|js|mjs|css|svg|json|txt|map)$/i;
const hits = [];
(function walk(d) {
  for (const name of readdirSync(d)) {
    const p = join(d, name);
    if (statSync(p).isDirectory()) walk(p);
    else {
      if (/logo-5\.svg$/.test(name)) hits.push(`${p}: ${BANNED[2].what}`);
      if (TEXT.test(name)) {
        const text = readFileSync(p, 'utf8');
        for (const b of BANNED) if (b.re.test(text)) hits.push(`${p}: ${b.what}`);
      }
    }
  }
})(dir);

if (hits.length) {
  console.error(`В нейтральной сборке найден бренд (${hits.length}):\n${[...new Set(hits)].join('\n')}`);
  process.exit(1);
}
console.log(`Нейтральная сборка чистая: ${dir}`);
