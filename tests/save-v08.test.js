// 0.8: сохранения — миграции вместо сброса, резервная копия, честная запись.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptySave, parseSave, SaveStore, SAVE_KEY, SAVE_BACKUP_KEY } from '../src/campaign/save.js';
import { CAMPAIGN } from '../src/campaign/data.js';

/** Хранилище в памяти; fail — набор ключей, запись которых бросает исключение. */
function memStorage(initial = {}, { failSet = false } = {}) {
  const m = new Map(Object.entries(initial));
  return {
    m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem(k, v) {
      if (failSet) throw new Error('quota');
      m.set(k, String(v));
    },
  };
}

const RESULT = { D: 88, stars: 3, dishes: {}, medals: ['perfectTaste'] };

/** Сохранение «старого формата» с завершённым днём 1 и баллами. */
function oldSave(version) {
  const s = emptySave();
  s.version = version;
  s.days[0].completed = true;
  s.days[0].best = s.days[0].last = RESULT;
  s.days[0].medals = ['perfectTaste'];
  s.days[0].stars = 3;
  s.bonus = 120;
  s.decor = ['lights'];
  return s;
}

// выдуманные миграции: v1 → v2 переименовывает bonus в points, v2 → v3 возвращает обратно с бонусом +5
const MIGRATIONS = {
  1: (d) => {
    const { bonus, ...rest } = d;
    return { ...rest, points: bonus };
  },
  2: (d) => {
    const { points, ...rest } = d;
    return { ...rest, bonus: points + 5 };
  },
};
const OPTS = { version: 3, migrations: MIGRATIONS };

test('сохранение прежней версии мигрирует по цепочке и не теряет прогресс', () => {
  const { save, status } = parseSave(JSON.stringify(oldSave(1)), OPTS);
  assert.equal(status, 'migrated');
  assert.equal(save.version, 3);
  assert.equal(save.days[0].completed, true, 'день 1 остаётся завершённым');
  assert.equal(save.days[1].unlocked, true, 'день 2 открыт');
  assert.deepEqual(save.days[0].medals, ['perfectTaste']);
  assert.equal(save.days[0].stars, 3);
  assert.equal(save.bonus, 125, 'обе миграции применены по порядку');
  assert.deepEqual(save.decor, ['lights']);
});

test('цепочка начинается с нужной версии: v2 проходит только вторую миграцию', () => {
  const s2 = oldSave(2);
  s2.points = 10;
  delete s2.bonus;
  const { save, status } = parseSave(JSON.stringify(s2), OPTS);
  assert.equal(status, 'migrated');
  assert.equal(save.bonus, 15);
});

test('нет шага в цепочке — сброс (а не молчаливое «как будто хорошо»)', () => {
  const { save, status } = parseSave(JSON.stringify(oldSave(1)), { version: 3, migrations: { 2: MIGRATIONS[2] } });
  assert.equal(status, 'reset');
  assert.equal(save.days[0].completed, false);
});

test('миграция бросает исключение — сброс, игра не падает', () => {
  const { status } = parseSave(JSON.stringify(oldSave(1)), { version: 2, migrations: { 1: () => { throw new Error('boom'); } } });
  assert.equal(status, 'reset');
});

test('сохранение от более новой версии игры — статус newer, не reset', () => {
  const { status } = parseSave(JSON.stringify(oldSave(9)), OPTS);
  assert.equal(status, 'newer');
});

test('текущая версия — ok; пустое — empty; мусор — reset', () => {
  assert.equal(parseSave(JSON.stringify(oldSave(3)), OPTS).status, 'ok');
  assert.equal(parseSave(null, OPTS).status, 'empty');
  assert.equal(parseSave('{не json', OPTS).status, 'reset');
  assert.equal(parseSave(JSON.stringify({ version: 3 }), OPTS).status, 'reset');
});

test('реальная версия формата не меняется молча и совпадает с данными', () => {
  assert.equal(emptySave().version, CAMPAIGN.saveVersion);
  assert.equal(parseSave(JSON.stringify(emptySave())).status, 'ok');
});

test('битое и устаревшее сохранение кладётся в резервную копию, основной ключ не теряется до записи', () => {
  const bad = '{не json';
  const st = memStorage({ [SAVE_KEY]: bad });
  const store = new SaveStore(st);
  assert.equal(store.status, 'reset');
  assert.equal(st.getItem(SAVE_BACKUP_KEY), bad, 'копия лежит как есть');

  const old = JSON.stringify(oldSave(0));
  const st2 = memStorage({ [SAVE_KEY]: old });
  assert.equal(new SaveStore(st2).status, 'reset');
  assert.equal(st2.getItem(SAVE_BACKUP_KEY), old);
});

test('чистый запуск и нормальное сохранение копию не создают', () => {
  const st = memStorage();
  new SaveStore(st);
  assert.equal(st.getItem(SAVE_BACKUP_KEY), null);
  const st2 = memStorage({ [SAVE_KEY]: JSON.stringify(emptySave()) });
  assert.equal(new SaveStore(st2).status, 'ok');
  assert.equal(st2.getItem(SAVE_BACKUP_KEY), null);
});

test('сохранение новее игры не перезаписывается, пока игрок не начнёт новую кампанию', () => {
  const newer = JSON.stringify({ ...oldSave(1), version: CAMPAIGN.saveVersion + 5 });
  const st = memStorage({ [SAVE_KEY]: newer });
  const store = new SaveStore(st);
  assert.equal(store.status, 'newer');
  assert.equal(store.write(), false, 'запись отклонена');
  assert.equal(store.writeError, 'protected');
  assert.equal(st.getItem(SAVE_KEY), newer, 'чужое сохранение осталось нетронутым');
  assert.equal(st.getItem(SAVE_BACKUP_KEY), newer, 'и есть копия');
  store.reset(); // «Новая кампания»
  assert.equal(store.write(), true);
  assert.notEqual(st.getItem(SAVE_KEY), newer);
  assert.equal(st.getItem(SAVE_BACKUP_KEY), newer, 'копия переживает новую кампанию');
});

test('без хранилища запись не «успешна»: false, available=false, причина названа', () => {
  const store = new SaveStore(null);
  assert.equal(store.available, false);
  assert.equal(store.write(), false);
  assert.equal(store.writeError, 'noStorage');
});

test('хранилище отказывает в записи — false и причина failed; потом успех сбрасывает причину', () => {
  const st = memStorage({}, { failSet: true });
  const store = new SaveStore(st);
  assert.equal(store.available, true);
  assert.equal(store.write(), false);
  assert.equal(store.writeError, 'failed');
  st.setItem = (k, v) => st.m.set(k, v);
  assert.equal(store.write(), true);
  assert.equal(store.writeError, null);
});

test('успешная запись возвращает true и кладёт сохранение под основной ключ', () => {
  const st = memStorage();
  const store = new SaveStore(st);
  store.data.bonus = 42;
  assert.equal(store.write(), true);
  assert.equal(JSON.parse(st.getItem(SAVE_KEY)).bonus, 42);
});
