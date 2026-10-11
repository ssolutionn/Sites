import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KitchenSession, run } from './helpers-campaign.js';
import { CAMPAIGN } from '../src/campaign/data.js';

function quiet() {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  s.chatter = null;
  s.msgQueue = [];
  s.triggers = [];
  return s;
}

test('печатает только перед ожидаемым сообщением, после отправки индикатор исчезает', () => {
  const s = quiet();
  s.msgQueue.push({ from: 'Верка', text: 'Привет', at: 10, sent: false });
  assert.equal(s.typingFrom().has('Верка'), false);
  run(s, 10 - CAMPAIGN.phone.typingAhead + 0.1);
  assert.equal(s.typingFrom().has('Верка'), true);
  run(s, CAMPAIGN.phone.typingAhead);
  assert.equal(s.typingFrom().has('Верка'), false);
  assert.equal(s.phone.messages.at(-1).text, 'Привет');
});

test('ответ в ЛС — своя прочитанная реплика и отложенный ответ собеседника', () => {
  const s = quiet();
  s.pushMessage('Верка', 'Скидываю фото', { photo: 'swimsuit' });
  s.markRead();
  assert.equal(s.replyChat('Верка', '   '), false);
  assert.equal(s.replyChat('Никто', 'Привет'), false);
  assert.equal(s.replyChat('Верка', ' Не грузится 😅 '), true);
  assert.equal(s.phone.messages.at(-1).mine, true);
  assert.equal(s.phone.messages.at(-1).text, 'Не грузится 😅');
  assert.equal(s.phone.unread, 0);
  run(s, CAMPAIGN.phone.replyDelay + 0.1);
  assert.equal(s.phone.messages.at(-1).from, 'Верка');
  assert.equal(!!s.phone.messages.at(-1).mine, false);
  assert.match(s.phone.messages.at(-1).text, /Интернет тоже на каникулах/);
  assert.equal(s.phone.unread, 1);
});

test('Верка не переспрашивает о фото и не печатает эту реплику, если уже ответили', () => {
  const s = quiet();
  s.pushMessage('Верка', 'Фото', { photo: 'swimsuit' });
  s.replyChat('Верка', 'Не грузится');
  s.msgQueue = [{ from: 'Верка', text: 'Ну как фотка?', at: 2, ifSilent: true }];
  assert.equal(s.typingFrom().has('Верка'), false);
  run(s, 3);
  assert.equal(s.phone.messages.some((m) => m.text === 'Ну как фотка?'), false);
});

test('двойной тап ставит лайк, повторный двойной тап его не снимает', () => {
  const s = quiet();
  s.fastForward(10);
  const id = s.phone.feed[0].id;
  const before = s.feedItems().find((p) => p.id === id).likes;
  assert.ok(s.likePost(id, true));
  assert.ok(s.likePost(id, true));
  assert.equal(s.phone.liked[id], true);
  assert.equal(s.feedItems().find((p) => p.id === id).likes, before + 1);
  s.likePost(id);
  assert.equal(!!s.phone.liked[id], false);
});

test('комментарии к посту и своему фото открываются, текст сохраняется без потери превью', () => {
  const s = quiet();
  s.fastForward(10);
  const key = s.feedItems()[0].key;
  assert.equal(s.commentPost('missing', 'Привет'), false);
  assert.equal(s.commentPost(key, '  '), false);
  assert.ok(s.commentPost(key, '  С наступающим!  '));
  assert.deepEqual(s.postComments(key).at(-1).text, 'С наступающим!');
  assert.equal(s.postComments(key).at(-1).who, 'me');
  assert.ok(s.postComments(key).length >= s.feedItems()[0].comments.length);
  s.dishes.olivier.done = true;
  s.dishes.olivier.Q = 90;
  s.postPhoto('olivier');
  const mine = s.feedItems().find((p) => p.mine);
  assert.ok(s.commentPost(mine.key, 'Мой салат'));
  assert.equal(s.postComments(mine.key).at(-1).text, 'Мой салат');
});
