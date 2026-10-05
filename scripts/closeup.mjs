// Быстрый снимок крупного плана доски (до и после поворота) на нескольких разрешениях.
const { chromium } = await import(process.env.PW ?? 'playwright');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [W, H] of [[1280, 720], [1920, 1080]]) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.goto('http://localhost:4173/?dev&seed=5');
  await page.waitForTimeout(1200);
  await page.click('[data-ui=play]');
  await page.click('[data-ui=start]');
  const waitFor = async (fn) => { for (let i = 0; i < 300; i++) { if (await page.evaluate(fn)) return; await page.waitForTimeout(100); } };
  await page.evaluate(() => { const g = window.__olivie.game; g.goTo('stove'); });
  await waitFor(() => window.__olivie.game.panel === 'stove');
  await page.evaluate(() => { const g = window.__olivie.game; g.placePot(); g.goTo('board'); });
  await waitFor(() => window.__olivie.game.panel === 'board' && window.__olivie.scene.camT >= 1);
  await page.evaluate(() => { const g = window.__olivie.game; const p = g.board.pieces[0]; g.boardClick(p.x + 1.3, 0); });
  await waitFor(() => !window.__olivie.game.action);
  const c = await page.evaluate(() => window.__olivie.scene.boardToScreen(0.2, 0.3));
  await page.mouse.move(c.x, c.y);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `scripts/shots/closeup_${W}_a.png` });
  await page.keyboard.press('KeyR');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `scripts/shots/closeup_${W}_b.png` });
  await page.close();
}
await browser.close();
