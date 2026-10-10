// Пакет для внешнего ревью (ChatGPT и др.): обзор без кода, весь код одним файлом, ZIP исходников, лист снимков.
//   node scripts/review-bundle.mjs            → review/sueta-<версия>-{overview.md, code.md, src.zip, screens.png}
//   node scripts/review-bundle.mjs --neutral  → то же без названия партнёра и без снимков (на них логотип)
// Что передать и какой запрос вставить — docs/CHATGPT_BRIEF.md. Папка review/ в git не попадает.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NEUTRAL = process.argv.includes('--neutral');
const OUT = join(ROOT, 'review');
const { version } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const TAG = `sueta-${version}${NEUTRAL ? '-neutral' : ''}`;

// Документы обзора — в этом порядке
const OVERVIEW = ['docs/CHATGPT_BRIEF.md', 'docs/IMPROVEMENTS.md', 'docs/CODE_TOUR.md', 'design/gdd/interaction-spec.md', 'CHANGELOG.md'];

// Файлы игры: только то, что под git, без инструментов процесса разработки, картинок и сборок
const INCLUDE = [
  /^src\//, /^tests\//, /^scripts\/[^/]+\.mjs$/, /^desktop\/[^/]+\.(c|m)?js$/, /^design\/(gdd|art|ui)\//,
  /^\.planning\//, /^\.github\/workflows\//,
  /^(package\.json|vite\.config\.js|index\.html|classic\.html|gallery\.html|README\.md|CHANGELOG\.md)$/,
  /^docs\/(CHATGPT_BRIEF|IMPROVEMENTS|CODE_TOUR|QA_v06|asset-contract|TZ_Novogodnyaya_sueta_build_v04)\.md$/,
];
const TEXT = new Set(['.js', '.mjs', '.cjs', '.css', '.md', '.html', '.json', '.yml', '.yaml']);
const isGameFile = (f) => INCLUDE.some((r) => r.test(f)) && TEXT.has(extname(f)) && !/(^|\/)CLAUDE\.md$/.test(f);

// Порядок чтения в одном файле: документы → логика кампании → вход → нож → сцена → интерфейс → остальное
const ORDER = [
  /^docs\/CHATGPT_BRIEF/, /^docs\/IMPROVEMENTS/, /^docs\/CODE_TOUR/, /^src\/campaign\/data\.js/, /^src\/campaign\/session\.js/,
  /^src\/campaign\/st-/, /^src\/main\.js/, /^src\/game\/raster-cut\.js/, /^src\/campaign\//, /^src\/view\/campaign-view/,
  /^src\/view\/cutboard/, /^src\/view\//, /^src\/ui\/campaign-ui/, /^src\/ui\//, /^src\/audio\//,
  /^src\/(game|classic|config|gallery|stream)/, /^tests\//, /^scripts\//, /^design\//, /^docs\//, /^desktop\//, /./,
];
const rank = (f) => ORDER.findIndex((r) => r.test(f));

// Снимки для листа: путь в production/qa/evidence → подпись
const SCREENS = [
  ['ui_menu_1280.png', 'Меню'],
  ['v7_kitchen_two_pots.png', 'Кухня: обзор, две конфорки'],
  ['v7_e2e_d1_board_sausage_cubes.png', 'Доска: кубики 1 см, поворот A/D'],
  ['v7_board_pickle_chop.png', 'Рубка: нож качают вверх-вниз'],
  ['v7_stove_closeup_flames.png', 'Плита: крутилки огня 0–9'],
  ['v7_sink_cool_tap.png', 'Остудить под краном'],
  ['v7_bowl_taste_scale.png', 'Миска: проба и шкала вкуса'],
  ['v7_canape_done.png', 'Канапе: стопка и шпажка'],
  ['phone_feed_meme.png', 'Телефон: лента «Андрея»'],
  ['v7_e2e_d1_result.png', 'Итог дня'],
];
const EVIDENCE = 'production/qa/evidence';

// Название партнёра и его бонусной карты записаны кодами символов, чтобы их не было и в этом файле внутри пакета
const cp = (...c) => String.fromCodePoint(...c);
const PARTNER = new RegExp(`${cp(0x41f, 0x44f, 0x442)}[её]${cp(0x440, 0x43e, 0x447, 0x43a)}[а-яё]*`, 'gi');
const PARTNER_CARD = new RegExp(`${cp(0x412, 0x44b, 0x440, 0x443, 0x447, 0x430, 0x439)}[- ]карт[а-яё]*`, 'gi');

/** Нейтральный вариант: название партнёра и его карта заменены, логотипы в пакет не попадают. */
function scrub(text) {
  if (!NEUTRAL) return text;
  return text.replace(PARTNER, '[партнёр]').replace(PARTNER_CARD, '[бонусная карта]');
}
const read = (f) => scrub(readFileSync(join(ROOT, f), 'utf8'));
const lines = (s) => s.split('\n').length;
/** Ограда кода длиннее любой серии обратных кавычек внутри файла. */
function fence(text) {
  const run = Math.max(0, ...(text.match(/`+/g) ?? []).map((m) => m.length));
  return '`'.repeat(Math.max(3, run + 1));
}
const LANG = { '.js': 'js', '.mjs': 'js', '.cjs': 'js', '.css': 'css', '.md': 'markdown', '.html': 'html', '.json': 'json', '.yml': 'yaml', '.yaml': 'yaml' };

const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT }).toString().split('\0').filter(Boolean);
const files = tracked.filter(isGameFile).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT }).toString().trim();
const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: ROOT }).toString().trim();
mkdirSync(OUT, { recursive: true });

// 1. Обзор без кода
const head = `# «Симулятор новогодней суеты» ${version} — обзор проекта${NEUTRAL ? ' (без названия партнёра)' : ''}\n\n` +
  `Собрано ${new Date().toISOString().slice(0, 10)} из ветки \`${branch}\`, коммит \`${commit}\`. ` +
  `Ниже по порядку: ${OVERVIEW.map((f) => `\`${f}\``).join(', ')}.\n`;
const overview = head + OVERVIEW.map((f) => `\n\n---\n\n<!-- файл: ${f} -->\n\n${read(f)}`).join('');
writeFileSync(join(OUT, `${TAG}-overview.md`), overview);

// 2. Весь код одним файлом: обзор + список файлов + исходники
const list = files.map((f) => `| \`${f}\` | ${lines(readFileSync(join(ROOT, f), 'utf8'))} |`).join('\n');
const code = files
  .filter((f) => !OVERVIEW.includes(f))
  .map((f) => { const t = read(f); const q = fence(t); return `\n## \`${f}\`\n\n${q}${LANG[extname(f)] ?? ''}\n${t}${t.endsWith('\n') ? '' : '\n'}${q}\n`; })
  .join('');
writeFileSync(join(OUT, `${TAG}-code.md`), `${overview}\n\n---\n\n# Список файлов (${files.length})\n\n| Файл | Строк |\n|---|---|\n${list}\n\n---\n\n# Исходный код\n${code}`);

// 3. ZIP: те же файлы как папка + снимки (кроме нейтрального варианта)
const STAGE = join(OUT, '.stage');
const DIR = join(STAGE, TAG);
rmSync(STAGE, { recursive: true, force: true });
for (const f of files) { mkdirSync(dirname(join(DIR, f)), { recursive: true }); writeFileSync(join(DIR, f), read(f)); }
if (!NEUTRAL) {
  mkdirSync(join(DIR, 'screens'), { recursive: true });
  for (const [n] of SCREENS) if (existsSync(join(ROOT, EVIDENCE, n))) copyFileSync(join(ROOT, EVIDENCE, n), join(DIR, 'screens', n));
}
const zip = join(OUT, `${TAG}-src.zip`);
rmSync(zip, { force: true });
execFileSync('zip', ['-qr', '-X', zip, TAG], { cwd: STAGE });
rmSync(STAGE, { recursive: true, force: true });

// 4. Лист снимков одной картинкой — нужен Playwright (как у остальных сценариев: PW=путь или пакет playwright)
let sheet = null;
if (!NEUTRAL) {
  try {
    const { chromium } = await import(process.env.PW ? pathToFileURL(process.env.PW).href : 'playwright');
    const cells = SCREENS.filter(([n]) => existsSync(join(ROOT, EVIDENCE, n)))
      .map(([n, cap], i) => `<figure><img src="${pathToFileURL(join(ROOT, EVIDENCE, n)).href}"><figcaption>${i + 1}. ${cap}</figcaption></figure>`).join('');
    const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:16px;background:#1d2a24;font:600 18px system-ui,sans-serif;color:#f4efe6;width:1288px}
      h1{margin:0 0 12px;font-size:22px}.g{display:grid;grid-template-columns:1fr 1fr;gap:12px}figure{margin:0}img{width:100%;display:block;border-radius:8px}
      figcaption{padding:6px 2px 0}</style><h1>«Симулятор новогодней суеты» ${version} — снимки игры</h1><div class="g">${cells}</div>`;
    // страница из файла, а не setContent: с about:blank браузер не грузит картинки с диска
    const page0 = join(OUT, '.screens.html');
    writeFileSync(page0, html);
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1320, height: 800 } });
    await page.goto(pathToFileURL(page0).href, { waitUntil: 'load' });
    sheet = join(OUT, `${TAG}-screens.png`);
    await page.screenshot({ path: sheet, fullPage: true });
    await browser.close();
    rmSync(page0, { force: true });
  } catch (e) {
    console.log('Лист снимков пропущен (нет Playwright?):', e.message.split('\n')[0]);
  }
}

const size = (p) => `${(statSync(p).size / 1024).toFixed(0)} КБ`;
console.log(`Файлов кода: ${files.length}, коммит ${commit}`);
for (const p of [`${TAG}-overview.md`, `${TAG}-code.md`, `${TAG}-src.zip`, sheet && `${TAG}-screens.png`].filter(Boolean)) console.log(`review/${p} — ${size(join(OUT, p))}`);
