// 0.10, владелец: «реализовать комментарии к постам». Комментарий героини не повисает в тишине: автор поста
// (или друг, которому она ответила) через несколько секунд отвечает, приходит уведомление, ответ виден в ветке.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KitchenSession, run } from './helpers-campaign.js';
import { CAMPAIGN } from '../src/campaign/data.js';
import { FEED_BY_ID, COMMENT_REPLIES } from '../src/campaign/feed-data.js';

const [MIN, MAX] = CAMPAIGN.phone.commentReply;

function quiet() {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  s.chatter = null;
  s.msgQueue = [];
  s.triggers = [];
  s.fastForward(10); // первый пост дня уже в ленте
  s.drain();
  return s;
}

test('автор поста отвечает на комментарий через несколько секунд: сначала «печатает», потом ответ и уведомление', () => {
  const s = quiet();
  const it = s.feedItems().find((i) => !i.mine);
  const author = FEED_BY_ID[it.id].author;
  assert.ok(s.commentPost(it.key, 'Красота 😍'));
  run(s, MIN - CAMPAIGN.phone.typingAhead - 0.2);
  assert.equal(s.commentTyping(it.key), null, 'рано печатать');
  assert.equal(s.postComments(it.key).at(-1).who, 'me');
  run(s, MAX - MIN + CAMPAIGN.phone.typingAhead + 0.5);
  const last = s.postComments(it.key).at(-1);
  assert.equal(last.who, author);
  assert.equal(last.to, 'me');
  assert.ok(COMMENT_REPLIES[author].includes(last.text), last.text);
  assert.ok(s.alerts.some((a) => a.key === 'phone' && /ответил/.test(a.text)), JSON.stringify(s.alerts.map((a) => a.text)));
  assert.ok(s.drain().some((e) => e.type === 'commentReply' && e.key === it.key && e.who === author));
  assert.equal(s.repliesUnread(), 1, 'ответ виден значком ленты');
  const before = s.feedUnread();
  s.markCommentsRead(it.key);
  assert.equal(s.repliesUnread(), 0);
  assert.equal(s.feedUnread(), before - 1);
});

test('ответ конкретному другу под своим фото — отвечает именно он', () => {
  const s = quiet();
  s.dishes.olivier.done = true;
  s.dishes.olivier.Q = 90;
  s.postPhoto('olivier');
  run(s, 70); // лайки набрались, друзья прокомментировали
  const mine = s.feedItems().find((p) => p.mine);
  const friends = s.postComments(mine.key).filter((c) => c.who !== 'me');
  assert.ok(friends.some((c) => c.who === 'granny'), JSON.stringify(friends));
  assert.ok(s.commentPost(mine.key, 'Спасибо, бабуль!', 'granny'));
  assert.equal(s.postComments(mine.key).at(-1).to, 'granny');
  run(s, MAX + 0.5);
  const last = s.postComments(mine.key).at(-1);
  assert.equal(last.who, 'granny');
  assert.equal(last.to, 'me');
});

test('на один пост — один ответ в пути; ответы автора не повторяются подряд', () => {
  const s = quiet();
  const it = s.feedItems().find((i) => !i.mine);
  s.commentPost(it.key, 'Раз');
  s.commentPost(it.key, 'Два');
  run(s, MAX + 0.5);
  const replies = s.postComments(it.key).filter((c) => c.to === 'me');
  assert.equal(replies.length, 1);
  s.commentPost(it.key, 'Три');
  run(s, MAX + 0.5);
  const again = s.postComments(it.key).filter((c) => c.to === 'me');
  assert.equal(again.length, 2);
  assert.notEqual(again[0].text, again[1].text);
});

test('у каждого автора ленты есть свои ответы, все не длиннее 80 знаков', () => {
  for (const p of Object.values(FEED_BY_ID)) assert.ok(COMMENT_REPLIES[p.author]?.length >= 2, p.author);
  for (const list of Object.values(COMMENT_REPLIES)) for (const t of list) assert.ok(t.length <= 80, t);
});
