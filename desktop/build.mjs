// Сборка десктопного приложения: dist/ → desktop-app/game, затем @electron/packager.
// node desktop/build.mjs [darwin|win32|linux] [arm64,x64]
import { execSync } from 'node:child_process';
import { cpSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { packager } from '@electron/packager';

const platform = process.argv[2] || 'darwin';
const arch = (process.argv[3] || 'arm64,x64').split(',');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const electronVersion = JSON.parse(readFileSync('node_modules/electron/package.json', 'utf8')).version;

execSync('npx vite build', { stdio: 'inherit' });
const stage = 'build/desktop-app';
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
cpSync('dist', `${stage}/game`, { recursive: true });
cpSync('desktop/main.cjs', `${stage}/main.cjs`);
writeFileSync(`${stage}/package.json`, JSON.stringify({ name: 'novogodnyaya-sueta', productName: 'Novogodnyaya Sueta', version: pkg.version, description: 'Симулятор новогодней суеты', author: 'Novogodnyaya Sueta team', main: 'main.cjs' }, null, 2));

const icon = existsSync('desktop/icon.icns') && platform === 'darwin' ? 'desktop/icon.icns' : existsSync('desktop/icon.png') ? 'desktop/icon.png' : undefined;
const out = await packager({
  dir: stage,
  out: 'build/desktop-out',
  overwrite: true,
  platform,
  arch,
  electronVersion,
  name: 'Novogodnyaya Sueta',
  appBundleId: 'ru.sueta.novogodnyaya',
  appCategoryType: 'public.app-category.simulation-games',
  appVersion: pkg.version,
  icon,
  asar: true,
  extendInfo: { CFBundleDisplayName: 'Новогодняя суета', NSHighResolutionCapable: true },
});
console.log('Готово:', out.join('\n'));
