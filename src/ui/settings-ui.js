// Экран «Настройки» (0.11): звук, мягкие жесты, размер текста, движение, полный экран, графика, клавиши.
// Бумажный диалог в #overlay (design/ui/ui-guidelines.md §1). Меняет настройки только через SettingsController.
import { keyName, explainBind } from '../keymap.js';
import { TEXT_SCALES, VOLUME_BUSES, VOLUME_LABELS, scalePercent, effectiveReduceMotion } from '../settings.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Размер текста интерфейса: масштаб слоёв поверх сцены (settings.css, body[data-ts]). 100 % — без масштаба вовсе. */
export function applyTextScale(scale, doc = document) {
  const pct = scalePercent(scale);
  doc.documentElement.style.setProperty('--ui-zoom', String(pct / 100));
  if (pct === 100) delete doc.body.dataset.ts;
  else doc.body.dataset.ts = String(pct);
}

/** Системная настройка «уменьшить движение». */
export function systemReduceMotion(win = globalThis.window) {
  try {
    return !!win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Класс на body: гасит анимации интерфейса и снег в меню (settings.css). */
export function applyReduceMotionClass(on, doc = document) {
  doc.body.classList.toggle('reduce-motion', !!on);
}

const switchRow = (id, name, on, { hint = '', extra = '', disabled = false, title = '' } = {}) =>
  `<div class="st-row"><span class="st-name" id="st-n-${id}">${name}${extra}</span>` +
  `<button type="button" class="st-switch" role="switch" aria-checked="${on}" aria-labelledby="st-n-${id}" data-sw="${id}"${disabled ? ' disabled' : ''}${title ? ` title="${esc(title)}"` : ''}><i></i><b>${on ? 'Вкл' : 'Выкл'}</b></button></div>` +
  (hint ? `<p class="st-hint">${hint}</p>` : '');

const segRow = (id, name, options, current) =>
  `<div class="st-row"><span class="st-name" id="st-n-${id}">${name}</span><div class="st-seg" role="radiogroup" aria-labelledby="st-n-${id}">` +
  options.map((o) => `<button type="button" role="radio" aria-checked="${o.value === current}" data-${id}="${o.value}">${o.label}</button>`).join('') +
  '</div></div>';

/**
 * Разметка экрана.
 * @param {{settings:object, muted:boolean, keymap:import('../keymap.js').Keymap, fs:{active:boolean, supported:boolean}, reduce:boolean}} c
 */
export function settingsHTML({ settings, muted, keymap, fs, reduce }) {
  const vol = VOLUME_BUSES.map((bus) => {
    const v = Math.round(settings.volume[bus] * 100);
    return `<label class="st-row"><span class="st-name">${VOLUME_LABELS[bus]}</span><span class="st-ctl"><input type="range" min="0" max="100" step="5" value="${v}" data-vol="${bus}" aria-valuetext="${v} %" /><output class="st-val" data-out="${bus}">${v} %</output></span></label>`;
  }).join('');
  const keys = keymap
    .list()
    .map(
      (r) =>
        `<li class="st-krow"><span class="st-name">${esc(r.label)}</span><button type="button" class="st-key${r.changed ? ' changed' : ''}" data-key="${r.action}" aria-label="${esc(r.label)}: ${esc(r.name)}. Нажми, чтобы выбрать другую клавишу">${esc(r.name)}</button></li>`,
    )
    .join('');
  return `<div class="card dialog settings" role="dialog" aria-modal="true" aria-labelledby="st-title" tabindex="-1">
    <h2 id="st-title">Настройки</h2>
    <div class="st-grid">
      <div class="st-col">
        <section class="st-sec" aria-labelledby="st-h-sound"><h3 id="st-h-sound">Звук</h3>
          ${vol}
          ${switchRow('muted', 'Без звука', muted, { extra: ` <kbd>${esc(keyName(keymap.get('mute')))}</kbd>` })}
        </section>
        <section class="st-sec" aria-labelledby="st-h-game"><h3 id="st-h-game">Игра</h3>
          ${switchRow('assist', 'Мягкие жесты', settings.assist, { hint: 'Допуски шире: для тачпада и неуверенной руки.' })}
          ${segRow('ts', 'Размер текста', TEXT_SCALES.map((s) => ({ value: s, label: `${scalePercent(s)} %` })), settings.textScale)}
          ${switchRow('motion', 'Меньше движения', reduce, { hint: 'Камера без качки, искр вдвое меньше.' })}
          ${switchRow('ghost', 'Подсказки рукой', settings.ghostHints, { hint: 'Рука показывает жест при первой встрече и после неудач.' })}
        </section>
      </div>
      <div class="st-col">
        <section class="st-sec" aria-labelledby="st-h-keys">
          <div class="st-head"><h3 id="st-h-keys">Управление</h3><button type="button" class="ghost st-reset" data-act="keysReset">Вернуть по умолчанию</button></div>
          <ul class="st-keys">${keys}</ul>
          <p class="st-hint">Стрелки всегда ходят, Esc всегда пауза.</p>
          <p class="st-msg" id="st-msg" role="status" aria-live="polite">Нажми на клавишу в списке, потом на новую. Esc — отмена.</p>
        </section>
        <section class="st-sec" aria-labelledby="st-h-screen"><h3 id="st-h-screen">Экран</h3>
          ${switchRow('fullscreen', 'Полный экран', fs.active, { extra: ` <kbd>${esc(keyName(keymap.get('fullscreen')))}</kbd>`, disabled: !fs.supported, title: fs.supported ? '' : 'В этом окне полный экран недоступен' })}
          ${segRow('q', 'Графика', [{ value: 'high', label: 'Красиво' }, { value: 'low', label: 'Экономно' }], settings.quality)}
        </section>
      </div>
    </div>
    <div class="actions st-actions"><button class="primary big" data-ui="settingsBack">Готово</button></div>
  </div>`;
}

/**
 * Оживить экран. Все изменения идут через ctl (SettingsController); после каждого экран подстраивается на месте,
 * не перерисовываясь (ползунок не теряет захват, фокус остаётся).
 * @returns {{refresh():void, dispose():void}} dispose обязателен при уходе с экрана: снимает перехват клавиши
 */
export function bindSettings(root, { ctl, fs, sound, keymap, onBack, onKeys }) {
  const $ = (sel) => root.querySelector(sel);
  const $$ = (sel) => [...root.querySelectorAll(sel)];
  const msg = (text, kind = '') => {
    const el = $('#st-msg');
    if (!el) return;
    el.textContent = text;
    el.className = `st-msg${kind ? ' ' + kind : ''}`;
  };
  let capturing = null; // { action, btn }
  const click = () => sound?.play?.('click');
  const reduceNow = () => effectiveReduceMotion(ctl.s, systemReduceMotion());

  function setSwitch(id, on) {
    const b = $(`[data-sw="${id}"]`);
    if (!b) return;
    b.setAttribute('aria-checked', String(!!on));
    b.querySelector('b').textContent = on ? 'Вкл' : 'Выкл';
  }
  function setSeg(id, value) {
    for (const b of $$(`[data-${id}]`)) b.setAttribute('aria-checked', String(String(b.dataset[id]) === String(value)));
  }
  function refresh() {
    const s = ctl.s;
    for (const bus of VOLUME_BUSES) {
      const v = Math.round(s.volume[bus] * 100);
      const inp = $(`[data-vol="${bus}"]`);
      if (inp && document.activeElement !== inp) inp.value = String(v);
      if (inp) inp.setAttribute('aria-valuetext', `${v} %`);
      const out = $(`[data-out="${bus}"]`);
      if (out) out.textContent = `${v} %`;
    }
    setSwitch('muted', sound.muted);
    setSwitch('assist', s.assist);
    setSwitch('motion', reduceNow());
    setSwitch('ghost', s.ghostHints);
    setSwitch('fullscreen', fs.active);
    setSeg('ts', s.textScale);
    setSeg('q', s.quality);
    for (const r of keymap.list()) {
      const b = $(`[data-key="${r.action}"]`);
      if (!b || (capturing && capturing.btn === b)) continue;
      b.textContent = r.name;
      b.classList.toggle('changed', r.changed);
      b.setAttribute('aria-label', `${r.label}: ${r.name}. Нажми, чтобы выбрать другую клавишу`);
    }
  }

  // --- перехват клавиши ---
  function stopCapture(restore = true) {
    if (!capturing) return;
    window.removeEventListener('keydown', onCaptureKey, true);
    capturing.btn.classList.remove('listening');
    capturing = null;
    if (restore) refresh();
  }
  function onCaptureKey(e) {
    // пока ждём клавишу, игра её не видит
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.repeat || !capturing) return;
    if (e.code === 'Escape' && capturing.action !== 'pause') {
      stopCapture();
      msg('Клавишу не меняли.');
      return;
    }
    const r = ctl.bindKey(capturing.action, e.code);
    if (r.ok) {
      const label = keymap.list().find((x) => x.action === capturing.action)?.label ?? '';
      stopCapture();
      msg(`«${label}» — теперь ${keyName(e.code)}.`, 'ok');
      onKeys?.();
    } else msg(explainBind(r, e.code), 'warn'); // ждём другую клавишу
  }
  function startCapture(btn) {
    stopCapture(false);
    refresh(); // прежняя «слушающая» кнопка получает свою подпись обратно
    capturing = { action: btn.dataset.key, btn };
    btn.classList.add('listening');
    btn.textContent = 'Нажми клавишу…';
    msg('Нажми новую клавишу. Esc — отмена.');
    window.addEventListener('keydown', onCaptureKey, true);
  }

  // --- ползунки ---
  root.addEventListener('input', (e) => {
    const bus = e.target?.dataset?.vol;
    if (!bus) return;
    ctl.setVolume(bus, Number(e.target.value) / 100, { save: false });
    refresh();
  });
  root.addEventListener('change', (e) => {
    const bus = e.target?.dataset?.vol;
    if (!bus) return;
    sound?.unlock?.();
    ctl.setVolume(bus, Number(e.target.value) / 100, { preview: true });
    refresh();
  });

  // --- кнопки ---
  root.addEventListener('click', async (e) => {
    const b = e.target.closest?.('button');
    if (!b || !root.contains(b) || b.disabled) return;
    if (b.dataset.key) {
      sound?.unlock?.();
      startCapture(b);
      return;
    }
    if (capturing) stopCapture();
    sound?.unlock?.();
    if (b.dataset.sw) {
      click();
      const id = b.dataset.sw;
      if (id === 'muted') ctl.setMuted(!sound.muted);
      else if (id === 'assist') ctl.setAssist(!ctl.s.assist);
      else if (id === 'motion') ctl.setReduceMotion(!reduceNow());
      else if (id === 'ghost') ctl.setGhostHints(!ctl.s.ghostHints);
      else if (id === 'fullscreen') {
        const ok = await ctl.requestFullscreen(!fs.active);
        if (!ok) msg('Окно не дало включить полный экран. Попробуй клавишу F11.', 'warn');
      }
      refresh();
    } else if (b.dataset.ts) {
      click();
      ctl.setTextScale(Number(b.dataset.ts));
      refresh();
    } else if (b.dataset.q) {
      click();
      ctl.setQuality(b.dataset.q);
      refresh();
    } else if (b.dataset.act === 'keysReset') {
      click();
      ctl.resetKeys();
      refresh();
      onKeys?.();
      msg('Клавиши вернулись к исходным.', 'ok');
    }
  });
  // щелчок мимо списка клавиш отменяет ожидание
  root.addEventListener('pointerdown', (e) => {
    if (capturing && !e.target.closest?.('[data-key]')) stopCapture();
  });
  // Esc в диалоге — «Готово»; на ползунке игра клавиш не видит, поэтому ловим здесь
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !capturing) {
      e.preventDefault();
      e.stopPropagation();
      onBack?.();
    }
  });
  const offFs = fs.onChange(() => refresh());
  refresh();
  return {
    refresh,
    dispose() {
      stopCapture(false);
      offFs();
    },
  };
}
