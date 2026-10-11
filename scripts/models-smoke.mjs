// Browser evidence for the GLB pipeline; PW can point to a system Chromium adapter.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PW ?? 'playwright');
const base = process.argv[2] ?? 'http://localhost:4180/';
const out = process.env.OUT ?? 'production/qa/evidence/cozy-3d';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const results = [], errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(new URL('model-gallery.html', base).href, { timeout: 180000 });
  await page.waitForFunction(() => !!window.__models, null, { timeout: 120000 });
  await page.evaluate(() => { const r = window.__models.renderer; r.shadowMap.enabled = false; r.setSize(640,480,false); document.querySelector('#pause').click(); });
  const pack = await page.evaluate(() => window.__models.status);
  assert.equal(pack.loaded.length, 27); assert.deepEqual(pack.failed, []);
  const ids = await page.evaluate(() => window.__models.manifest.models.map((m) => m.id));
  for (const id of ids) {
    const row = await page.evaluate(async (id) => {
      const v = window.__models; await v.show(id);
      const checks = [];
      for (const option of document.querySelector('#clip').options) {
        if (!option.value) continue;
        document.querySelector('#clip').value = option.value;
        document.querySelector('#clip').dispatchEvent(new Event('change'));
        const a = v.action; v.mixer.setTime(a.getClip().duration / 2);
        v.current.updateMatrixWorld(true);
        let finite = true;
        v.current.traverse((o) => { finite &&= o.matrixWorld.elements.every(Number.isFinite); if (o.morphTargetInfluences) finite &&= o.morphTargetInfluences.every(Number.isFinite); });
        checks.push({ clip: option.value, finite });
      }
      return { id, clips: checks };
    }, id);
    assert.ok(row.clips.every((c) => c.finite), `${id}: invalid animated transform`); results.push(row);
    if (await page.evaluate((id) => window.__models.manifest.models.find((m)=>m.id===id).runtime,id)) {
      await page.evaluate(() => {
        const v=window.__models, select=document.querySelector('#clip');
        if ([...select.options].some((o)=>o.value==='idle')) {select.value='idle';select.dispatchEvent(new Event('change'));v.mixer.setTime(.5);}
        v.renderer.render(v.scene,v.camera);
      });
      await page.screenshot({path:`${out}/model_${id}.png`});
    }
  }
  await page.evaluate(async () => {
    const v = window.__models; await v.show('cat');
    document.querySelector('#clip').value = 'sit'; document.querySelector('#clip').dispatchEvent(new Event('change'));
    v.mixer.setTime(1.5); v.current.updateMatrixWorld(true); v.renderer.render(v.scene,v.camera);
  });
  const paws = await page.evaluate(() => {
    const root = window.__models.current;
    return ['forepaw_l','forepaw_r','hindpaw_l','hindpaw_r'].map((n) => ({ bone: n, y: root.getObjectByName(n).getWorldPosition(root.position.clone()).y }));
  });
  console.log('PAWS', paws);
  assert.ok(paws.every((p) => Math.abs(p.y-(p.bone.startsWith('fore')?.055:.045)) < .002), 'sitting paws must stay at floor contact');
  await page.screenshot({ path: `${out}/gallery_cat_sit.png` });
  await page.close();

  for (const mode of ['models','procedural','damaged-girl']) {
    const p = await browser.newPage({ viewport: { width: 960, height: 720 } });
    p.on('pageerror',(e) => errors.push(e.message));
    p.on('console',(m) => { if (m.type() === 'error') errors.push(m.text()); });
    await p.addInitScript(() => localStorage.setItem('novogodnyaya-sueta.campaign',JSON.stringify({version:1,days:[],settings:{quality:'low'}})));
    if (mode === 'damaged-girl') await p.route('**/characters/girl/girl.glb', (r) => r.fulfill({status:200,body:'damaged model'}));
    await p.goto(new URL(mode === 'procedural' ? '?procedural=1' : '',base).href,{timeout:180000});
    await p.waitForFunction(() => !!window.__sueta,null,{timeout:120000});
    await p.evaluate(() => { const a = window.__sueta; a.sv.renderer.setSize(640,480,false); a.app.ui('new'); a.app.ui('enter'); });
    await p.waitForFunction(() => window.__sueta.sv.camT >= 1,null,{timeout:60000});
    await p.waitForTimeout(500);
    const row = await p.evaluate(() => {
      const {sv,models} = window.__sueta; const roots=[];
      sv.scene.traverse((o) => { if (['heroine','girl_instance','cat','cat_instance'].includes(o.name)) roots.push(o.name); });
      sv.renderer.render(sv.scene,sv.camera);
      return {models, girl:sv.heroine.userData.rig??'procedural', cat:sv.cat.userData.rig??'procedural', roots, render:{...sv.renderer.info.render}, fatal:document.querySelector('#fatal').textContent};
    });
    assert.equal(row.fatal,''); assert.equal(row.roots.length,2);
    assert.equal(row.girl,mode === 'models' ? 'gltf' : 'procedural'); assert.equal(row.cat,mode === 'procedural' ? 'procedural' : 'gltf');
    if (mode === 'models') { assert.equal(row.models.loaded.length,12); assert.deepEqual(row.models.failed,[]); }
    if (mode === 'damaged-girl') assert.deepEqual(row.models.failed,['girl']);
    await p.screenshot({path:`${out}/game_${mode}.png`}); results.push({mode,...row}); console.log(mode,row);
    await p.close();
  }
  assert.deepEqual(errors,[]);
  await writeFile(`${out}/models-smoke.json`, JSON.stringify({results,errors},null,2)+'\n');
  console.log('PASS: 27 models, 27 animation clips, 3 startup modes, no page errors');
} finally { await browser.close(); }
