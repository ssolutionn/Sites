import fs from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { SVGRenderer } from 'three/addons/renderers/SVGRenderer.js';
import { buildHeroine, animateHeroine, setExpression } from '../src/view/heroine.js';
import { buildCat, animateCat } from '../src/view/cat.js';

// Offline geometry render, not a browser screenshot. Small SVG DOM adapter.
class SvgNode {
 constructor(tag){this.tag=tag;this.attributes={};this.childNodes=[];this.style={};}
 setAttribute(k,v){this.attributes[k]=String(v);}
 appendChild(n){this.childNodes.push(n);}
 removeChild(n){this.childNodes.splice(this.childNodes.indexOf(n),1);}
 get outerHTML(){return `<${this.tag} ${Object.entries(this.attributes).map(([k,v])=>`${k}="${v.replaceAll('"','&quot;')}"`).join(' ')}>${this.childNodes.map(c=>c.outerHTML).join('')}</${this.tag}>`;}
}
globalThis.document={createElementNS:(_,tag)=>new SvgNode(tag)};
globalThis.FileReader=class {
 readAsArrayBuffer(blob){blob.arrayBuffer().then(value=>{this.result=value;this.onloadend?.();});}
 readAsDataURL(blob){blob.arrayBuffer().then(value=>{this.result=`data:${blob.type};base64,${Buffer.from(value).toString('base64')}`;this.onloadend?.();});}
};
await fs.mkdir('public/models',{recursive:true});
await fs.mkdir('docs/previews',{recursive:true});

function stats(root){let meshes=0,triangles=0;root.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});return {meshes,triangles};}

function recordClip(root, name, duration, animator){
 const nodes=[];root.traverse(o=>{if(o.isGroup && o.name)nodes.push(o);});
 const previous=nodes.map(o=>({pos:o.position.clone(),quat:o.quaternion.clone(),scale:o.scale.clone()}));
 const times=[],values=nodes.map(()=>({p:[],q:[]}));
 for(let i=0;i<=24;i++){
  const t=duration*i/24;times.push(t);animator(t);
  nodes.forEach((o,k)=>{values[k].p.push(...o.position.toArray());values[k].q.push(...o.quaternion.toArray());});
 }
 const tracks=[];
 nodes.forEach((o,k)=>{
  const v=values[k];
  if(v.p.some((x,i)=>Math.abs(x-v.p[i%3])>1e-7))tracks.push(new THREE.VectorKeyframeTrack(`${o.name}.position`,times,v.p));
  if(v.q.some((x,i)=>Math.abs(x-v.q[i%4])>1e-7))tracks.push(new THREE.QuaternionKeyframeTrack(`${o.name}.quaternion`,times,v.q));
  o.position.copy(previous[k].pos);o.quaternion.copy(previous[k].quat);o.scale.copy(previous[k].scale);
 });
 return new THREE.AnimationClip(name,duration,tracks);
}

async function exportGLB(root,filename,clips){
 // Object3D.clone() JSON-serializes userData containing mesh references.
 // Clear it only after recording runtime animation curves.
 root.traverse(o=>{o.userData={};});
 root.updateMatrixWorld(true);
 const buffer=await new GLTFExporter().parseAsync(root,{binary:true,animations:clips,onlyVisible:true});
 await fs.writeFile(`public/models/${filename}`,Buffer.from(buffer));
 return buffer.byteLength;
}

async function render(root, filename, target, pos){
 const scene=new THREE.Scene();scene.add(root);
 const ambient=new THREE.AmbientLight(0xffffff,.75);scene.add(ambient);
 const sun=new THREE.DirectionalLight(0xffedda,1.1);sun.position.set(-3,5,5);scene.add(sun);
 const fill=new THREE.DirectionalLight(0xddeaff,.35);fill.position.set(4,2,-2);scene.add(fill);
 const camera=new THREE.PerspectiveCamera(35,1,0.01,50);camera.position.set(...pos);camera.lookAt(...target);camera.updateMatrixWorld();scene.updateMatrixWorld(true);
 const payload=[];
 root.traverseVisible(o=>{
  if(!o.isMesh)return;
  const g=o.geometry,position=g.attributes.position,normal=g.attributes.normal,mat=o.material;
  if(Array.isArray(mat))return;
  const normalMatrix=new THREE.Matrix3().getNormalMatrix(o.matrixWorld),verts=[],normals=[],projected=[];
  for(let i=0;i<position.count;i++){
   const v=new THREE.Vector3().fromBufferAttribute(position,i).applyMatrix4(o.matrixWorld);verts.push(...v.toArray());
   const n=new THREE.Vector3().fromBufferAttribute(normal,i).applyMatrix3(normalMatrix).normalize();normals.push(...n.toArray());
   const ndc=v.clone().project(camera);projected.push(...ndc.toArray());
  }
  payload.push({positions:verts,normals,projected,indices:g.index?Array.from(g.index.array):Array.from({length:position.count},(_,i)=>i),color:mat.color.toArray(),roughness:mat.roughness});
 });
 await fs.writeFile(`/tmp/sueta-${filename}.json`,JSON.stringify({meshes:payload,camera:pos}));
 const renderer=new SVGRenderer();renderer.setSize(1000,1000);renderer.setPrecision(3);renderer.overdraw=.35;
 renderer.render(scene,camera);
 const inner=renderer.domElement.childNodes.map(c=>c.outerHTML).join('');
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="-500 -500 1000 1000"><defs><radialGradient id="bg"><stop stop-color="#fff5e9"/><stop offset="1" stop-color="#e1eadd"/></radialGradient></defs><rect x="-500" y="-500" width="1000" height="1000" fill="url(#bg)"/><ellipse cx="0" cy="330" rx="210" ry="25" fill="#526949" opacity=".13"/>${inner}</svg>`;
 await fs.writeFile(`docs/previews/${filename}.svg`,svg);
 return svg;
}

const girl=buildHeroine();animateHeroine(girl,'idle',0);setExpression(girl,false);
await render(girl,'heroine_front',[0,.98,0],[.58,1.19,3.05]);
setExpression(girl,true);await render(girl,'heroine_worried',[0,1.40,0],[.25,1.52,1.4]);
const cat=buildCat();animateCat(cat,'idle',0,0);
await render(cat,'cat_front',[0,.30,.03],[.65,.51,1.27]);
const gstats=stats(girl),cstats=stats(cat);
setExpression(girl,false);animateHeroine(girl,'idle',0);
const girlClips=[recordClip(girl,'Idle',Math.PI*2/2.2,t=>animateHeroine(girl,'idle',t)),recordClip(girl,'Walk',Math.PI*2/11,t=>animateHeroine(girl,'walk',t)),recordClip(girl,'Mix',Math.PI*2/9,t=>animateHeroine(girl,'mix',t))];
const catClips=[recordClip(cat,'Idle',Math.PI*2/4,t=>animateCat(cat,'idle',t,0)),recordClip(cat,'Walk',Math.PI*2/14,t=>animateCat(cat,'walk',t,1)),recordClip(cat,'Reach',Math.PI*2/9,t=>animateCat(cat,'reach',t,0))];
const girlBytes=await exportGLB(girl,'heroine.glb',girlClips);
const catBytes=await exportGLB(cat,'cat.glb',catClips);
const report={heroine:{...gstats,bytes:girlBytes,animations:girlClips.map(x=>x.name)},cat:{...cstats,bytes:catBytes,animations:catClips.map(x=>x.name)}};
await fs.writeFile('docs/model-stats.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
