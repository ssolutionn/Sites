import test from 'node:test';
import assert from 'node:assert/strict';
import { CampaignUI } from '../src/ui/campaign-ui.js';

test('cat instructions describe theft, spilled drinks and tree mischief separately', () => {
  const topics=[];
  const ui={tip:(topic)=>topics.push(topic),_tipDone:()=>{}};
  for (const kind of ['theft','spill','mischief']) CampaignUI.prototype.onEvent.call(ui,{type:'catStart',kind},{});
  assert.deepEqual(topics,['catTheft','catSpill','catWave']);
});
test('an automatic gift tip waits while the player is shooing the cat', () => {
  const called=[], session={panel:null,cat:{state:'mischief'}};
  const ui={app:{session},tipShown:new Set(),pendingTips:[],tip:(topic)=>called.push(topic)};
  CampaignUI.prototype.tipWhenFree.call(ui,'gifts');
  assert.deepEqual(called,[]);assert.deepEqual(ui.pendingTips,['gifts']);
  session.cat.state='home';CampaignUI.prototype.tipWhenFree.call(ui,'gifts');
  assert.deepEqual(called,['gifts']);
});
