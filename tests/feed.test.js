// Лента «Андрея»: данные постов, появление по дням и часам, порядок, непрочитанные, лайки, фото героини.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KitchenSession } from './helpers-campaign.js';
import { FEED_POSTS, FEED_AUTHORS, FEED_BY_ID, MY_POST, FEED_TUNE } from '../src/campaign/feed-data.js';
import { FEED_ART_KEYS, feedArt } from '../src/ui/feed-art.js';

const ids = (s) => s.feedItems().map((i) => i.key);
const day = (dayIndex) => new KitchenSession({ dayIndex, seed: 1 });

test('данные ленты: 18–25 постов на все 7 дней, тексты короткие, авторы и картинки существуют', () => {
  assert.ok(FEED_POSTS.length >= 18 && FEED_POSTS.length <= 25, `постов: ${FEED_POSTS.length}`);
  assert.equal(new Set(FEED_POSTS.map((p) => p.id)).size, FEED_POSTS.length, 'id уникальны');
  for (let d = 1; d <= 7; d++) {
    const today = FEED_POSTS.filter((p) => p.day === d);
    assert.ok(today.length >= 2, `день ${d}: постов ${today.length}`);
    assert.ok(today.some((p) => p.at > 30), `день ${d}: есть пост, который придёт во время готовки`);
  }
  for (const p of FEED_POSTS) {
    assert.ok(p.text.length <= 140, `${p.id}: пост длиннее 140`);
    assert.ok(FEED_AUTHORS[p.author], `${p.id}: автор ${p.author}`);
    assert.ok(p.at >= 0 && p.at <= 300, `${p.id}: at ${p.at}`);
    assert.ok(p.comments.length >= 1 && p.talk >= p.comments.length, `${p.id}: комментарии`);
    for (const c of p.comments) {
      assert.ok(c.text.length <= 80, `${p.id}: комментарий длиннее 80`);
      assert.ok(FEED_AUTHORS[c.who], `${p.id}: автор комментария ${c.who}`);
    }
    if (p.art) {
      assert.ok(FEED_ART_KEYS.includes(p.art), `${p.id}: нет картинки ${p.art}`);
      assert.match(feedArt(p.art, p.alt), /^<svg[^>]+role="img"[^>]+aria-label="[^"]+"/);
    }
  }
  for (const c of MY_POST.comments) assert.ok(c.text.length <= 80 && FEED_AUTHORS[c.who]);
});

test('в ленте есть ИДЕАЛЬНОЕ оливье с маминым «Вот видишь, как надо» и мемы с котиками', () => {
  const ol = FEED_POSTS.find((p) => p.author === 'alina' && /ИДЕАЛЬНОЕ оливье/.test(p.text));
  assert.ok(ol, 'пост дочери маминой подруги');
  assert.ok(ol.comments.some((c) => c.who === 'mom' && c.text.startsWith('Вот видишь, как надо')));
  assert.equal(FEED_AUTHORS.alina.note, 'дочь маминой подруги');
  const cats = FEED_POSTS.filter((p) => p.author === 'cats').map((p) => p.art);
  assert.deepEqual(cats.sort(), ['catBowl', 'catMandarin', 'catPanic', 'catTree']);
  assert.ok(FEED_POSTS.some((p) => p.poll), 'опрос «майонез или сметана»');
});

test('пост виден с его дня и часа: прошлые дни уже в ленте, сегодняшние приходят по времени', () => {
  const s = day(2); // день 3
  const before = ids(s);
  assert.deepEqual(before.sort(), FEED_POSTS.filter((p) => p.day < 3).map((p) => p.id).sort());
  assert.ok(s.phone.feed.every((f) => f.read), 'прошлые дни прочитаны');
  s.fastForward(11);
  assert.ok(!ids(s).includes('d3-cattree'), 'ещё рано');
  s.fastForward(2);
  assert.ok(ids(s).includes('d3-cattree'));
  assert.ok(!ids(s).includes('d3-caviar'));
  s.fastForward(110);
  assert.ok(ids(s).includes('d3-caviar'));
  assert.ok(!ids(s).some((id) => FEED_BY_ID[id]?.day > 3), 'завтрашних постов нет');
});

test('лента в практике пустая', () => {
  const s = new KitchenSession({ practice: { activity: 'cubes' }, seed: 1 });
  s.fastForward(400);
  assert.equal(s.feedItems().length, 0);
  assert.equal(s.phone.unread, 0);
});

test('новые сверху: по дню, затем по времени', () => {
  const s = day(3); // день 4
  s.fastForward(310);
  const items = s.feedItems();
  assert.deepEqual(items.slice(0, 3).map((i) => i.key), ['d4-china', 'd4-garland', 'd4-poll']);
  for (let i = 1; i < items.length; i++) {
    const a = items[i - 1], b = items[i];
    assert.ok(a.day > b.day || (a.day === b.day && a.at >= b.at), `${a.key} раньше ${b.key}`);
  }
});

test('непрочитанные: пост и сообщение копятся в одном значке, чаты и лента читаются отдельно', () => {
  const s = day(0);
  assert.equal(s.phone.unread, 0);
  s.fastForward(9);
  assert.equal(s.phone.unread, 1);
  assert.equal(s.feedUnread(), 1);
  assert.ok(s.drain().some((e) => e.type === 'feedPost' && e.id === 'd1-signal'));
  s.fastForward(32); // сообщение Верки в 40 с
  assert.equal(s.phone.unread, 2);
  s.markRead();
  assert.equal(s.phone.unread, 1, 'чаты прочитаны, пост ленты — нет');
  assert.equal(s.feedUnread(), 1);
  assert.ok(s.feedItems().find((i) => i.key === 'd1-signal').unread);
  s.fastForward(30); // кот в миске в 70 с
  assert.equal(s.phone.unread, 2);
  assert.ok(s.markFeedRead());
  assert.equal(s.phone.unread, 0);
  assert.ok(s.feedItems().every((i) => !i.unread));
});

test('лайк: +1 и обратно, только у появившегося поста', () => {
  const s = day(1); // день 2
  assert.equal(s.likePost('d2-pan'), false, 'пост ещё не пришёл');
  assert.equal(s.likePost('нет-такого'), false);
  const old = () => s.feedItems().find((i) => i.key === 'd1-catbowl');
  assert.equal(old().likes, FEED_BY_ID['d1-catbowl'].likes, 'вчерашний пост — все лайки');
  assert.ok(s.likePost('d1-catbowl'));
  assert.equal(old().likes, FEED_BY_ID['d1-catbowl'].likes + 1);
  assert.equal(old().liked, true);
  assert.ok(s.drain().some((e) => e.type === 'feedLike' && e.id === 'd1-catbowl' && e.on));
  assert.ok(s.likePost('d1-catbowl'));
  assert.equal(old().likes, FEED_BY_ID['d1-catbowl'].likes);
  assert.equal(old().liked, false);
});

test('лайки свежего поста растут ступеньками до итога', () => {
  const s = day(1);
  const p = FEED_BY_ID['d2-sea'];
  s.fastForward(p.at + 0.1);
  const likes = () => s.feedItems().find((i) => i.key === p.id).likes;
  assert.equal(likes(), Math.round(p.likes * FEED_TUNE.growFrom));
  s.fastForward(FEED_TUNE.growTime / 2);
  assert.ok(likes() > Math.round(p.likes * FEED_TUNE.growFrom) && likes() < p.likes);
  s.fastForward(FEED_TUNE.growTime);
  assert.equal(likes(), p.likes);
});

test('фото героини встаёт в ту же ленту сверху, с лайками и комментариями; своё не лайкается', () => {
  const s = day(0);
  s.fastForward(160);
  s._finishDish('olivier', { prep: 95, comp: 100, asm: 100 }, []);
  assert.ok(s.postPhoto('olivier'));
  const unread = s.phone.unread;
  const top = () => s.feedItems()[0];
  assert.equal(top().mine, true);
  assert.equal(top().dishId, 'olivier');
  assert.match(top().text, /сама приготовила/);
  assert.ok(s.feedItems().slice(1).some((i) => i.key === 'd1-olivier'), 'рядом с ИДЕАЛЬНЫМ оливье');
  assert.equal(top().comments.length, 0);
  assert.equal(s.phone.unread, unread, 'своё фото не непрочитанное');
  assert.equal(s.likePost(top().id), false);
  s.fastForward(61);
  assert.equal(top().key, `me-${s.phone.posts[0].id}`, 'фото всё ещё новее постов друзей');
  assert.ok(top().likes > 50);
  assert.ok(top().comments.length >= 1 && top().comments.length <= FEED_TUNE.preview);
  assert.ok(top().talk >= top().comments.length);
  assert.ok(top().comments.every((c) => FEED_AUTHORS[c.who]));
});
