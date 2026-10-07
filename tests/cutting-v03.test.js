import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cutAcross, initialPieces, totalVolume, rotatePieces, pieceAt, bounds, accuracy } from '../src/game/cutting.js';
import { Game } from '../src/game/game.js';
import { CONFIG } from '../src/config.js';
let serial=10000;
const opts={minWidth:.2,maxPieces:150,nextId:()=>serial++};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);

test('one stroke cuts every intersected strip and conserves volume',()=>{
 let p=initialPieces(4,2,()=>serial++);
 for(const x of [-1,0,1])p=cutAcross(p,x,opts).pieces;
 assert.equal(p.length,4);
 p=rotatePieces(p);
 const result=cutAcross(p,0,opts);
 assert.equal(result.cuts.length,4);assert.equal(result.pieces.length,8);
 close(totalVolume(result.pieces),8);close(accuracy(result.pieces,CONFIG.tolerance),1);
});

test('free cut is not snapped to a grid',()=>{
 const p=initialPieces(4,2,()=>serial++),r=cutAcross(p,.371,opts);
 assert.equal(r.ok,true);close(r.pieces[0].w,2.371);close(r.pieces[1].w,1.629);
 assert.ok(accuracy(r.pieces,CONFIG.tolerance)<1);
});

test('a rejected batch leaves pieces and ID source untouched',()=>{
 const p=initialPieces(4,2,()=>serial++),before=serial;
 const r=cutAcross(p,1.95,opts);
 assert.equal(r.ok,false);assert.equal(serial,before);assert.equal(p.length,1);
});

test('batch limit counts every new fragment atomically',()=>{
 let p=initialPieces(4,2,()=>serial++);
 p=cutAcross(p,0,opts).pieces;p=rotatePieces(p);
 const before=serial,r=cutAcross(p,0,{...opts,maxPieces:3});
 assert.equal(r.reason,'limit');assert.equal(serial,before);assert.equal(p.length,2);
});

test('round slice has a real silhouette: empty corners cannot be selected',()=>{
 const p=initialPieces(4,2,()=>serial++,'oval');
 assert.equal(pieceAt(p,1.9,.95),null);assert.ok(pieceAt(p,0,0));
 assert.ok(totalVolume(p)<8 && totalVolume(p)>6);
});

test('curved pieces keep shape and mass through repeated cuts and rotations',()=>{
 let p=initialPieces(4,2,()=>serial++,'carrot'),original=totalVolume(p);
 for(let i=0;i<120;i++){
  const b=bounds(p),x=b.minX+(b.maxX-b.minX)*(0.17+(i%6)*.13);
  const r=cutAcross(p,x,opts);if(r.ok)p=r.pieces;
  p=rotatePieces(p);close(totalVolume(p),original);
  assert.ok(p.every(q=>q.polygon && q.w>0 && q.d>0));
 }
 assert.equal(new Set(p.map(q=>q.id)).size,p.length);
});

test('four rotations preserve curved slice positions',()=>{
 let p=initialPieces(4,2,()=>serial++,'egg');const before=JSON.stringify(p[0].polygon);
 for(let i=0;i<4;i++)p=rotatePieces(p);
 const original=JSON.parse(before);p[0].polygon.forEach((q,i)=>{close(q.x,original[i].x);close(q.z,original[i].z);});
});

function arrive(g,station){g.goTo(station);for(let i=0;i<180;i++)g.update(1/60);}
test('player chop has no extra selection click and blocks repeat during animation',()=>{
 const g=new Game();arrive(g,'stove');g.placePot();arrive(g,'board');
 assert.equal(g.sliceBoard(-1,0),'cut');assert.equal(g.sliceBoard(0,0),'ignored');
 for(let i=0;i<25;i++)g.update(1/60);
 assert.equal(g.board.pieces.length,2);
 assert.equal(g.sliceBoard(0,0),'cut');for(let i=0;i<25;i++)g.update(1/60);
 assert.equal(g.board.pieces.length,3);
 assert.equal(g.sliceBoard(99,99),'miss');
});

test('changing station cancels pending batch cut without changing mass',()=>{
 const g=new Game();arrive(g,'stove');g.placePot();arrive(g,'board');
 const mass=totalVolume(g.board.pieces);g.sliceBoard(0,0);arrive(g,'bowl');
 assert.equal(g.ingredients.carrot.pieces.length,1);close(totalVolume(g.ingredients.carrot.pieces),mass);
});
