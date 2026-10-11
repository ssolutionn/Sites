import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { instantiateModel, loadModels, modelStatus, modelClips } from './view/assets.js';

async function bootGallery() {

const title = { girl:'Героиня',cat:'Рыжий кот',carrot:'Морковь',potato:'Картофель',potato_peeled:'Очищенный картофель',egg:'Яйцо',egg_peeled:'Очищенное яйцо',pickle:'Огурец',beet:'Свёкла',onion:'Лук',tomato:'Помидор',sausage:'Колбаса',cheese:'Сыр',bread:'Хлеб',board:'Доска',knife:'Нож',bowl:'Миска',cat_bowl:'Миска кота',pot:'Кастрюля',grater:'Тёрка',star_ornament:'Звезда',heart_ornament:'Сердце',island:'Кухонный остров',back_counter:'Столешница и шкафчики',fridge:'Холодильник',stove:'Плита',sink:'Мойка' };
const canvas = document.querySelector('#models'), asset = document.querySelector('#asset'), clip = document.querySelector('#clip');
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true });
renderer.setPixelRatio(Math.min(devicePixelRatio,2)); renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=.92;
const scene = new THREE.Scene();scene.background = new THREE.Color(0xece6d8);
const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();scene.environment=pmrem.fromScene(room).texture;scene.environmentIntensity=.3;room.dispose();pmrem.dispose();
scene.add(new THREE.HemisphereLight(0xffefd2,0x879489,1.2));
const sun = new THREE.DirectionalLight(0xffe0b5,2.7);sun.position.set(-3,6,4);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.bias=-.0002;sun.shadow.camera.left=-5;sun.shadow.camera.right=5;sun.shadow.camera.top=5;sun.shadow.camera.bottom=-5;scene.add(sun);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(80,80),new THREE.MeshStandardMaterial({color:0xd9c9ad,roughness:.9}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;floor.position.y=-.001;scene.add(floor);
const camera = new THREE.PerspectiveCamera(36,1,.005,100), controls = new OrbitControls(camera,canvas);controls.enableDamping=true;controls.maxPolarAngle=Math.PI/2;
let current=null,mixer=null,action=null,manifest=null,paused=false,frames=0,actions=new Map(),downloadURL=null;
function removeCurrent() {
  if(!current)return;
  mixer?.stopAllAction();mixer?.uncacheRoot(current);
  current.traverse((o)=>{if(o.isSkinnedMesh)o.skeleton.dispose();});scene.remove(current);current=null;
}
async function show(id) {
  asset.value=id;
  removeCurrent();const row=manifest.models.find((m)=>m.id===id);current=instantiateModel(id);if(!current)throw new Error(`Не загрузилась модель ${id}`);
  scene.add(current);current.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(current),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
  const d=Math.max(size.x,size.y,size.z,.1);controls.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(d*.65,d*.43,d*1.6));controls.minDistance=d*.4;controls.maxDistance=d*5;controls.update();
  mixer=new THREE.AnimationMixer(current);actions=new Map();clip.replaceChildren(new Option('Поза покоя',''));
  for(const c of modelClips(id)){const a=mixer.clipAction(c);a.enabled=false;actions.set(c.name,a);clip.add(new Option(c.name,c.name));}
  clip.disabled=!row.clips.length;clip.value=row.clips.includes('idle')?'idle':'';play();
  document.querySelector('#status').textContent=`${row.triangles.toLocaleString('ru-RU')} треугольников · ${row.materials} материалов\n${(row.bytes/1024).toFixed(0)} КБ · ${row.bones} костей\n${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)} м`;
  if(downloadURL)URL.revokeObjectURL(downloadURL);
  if(window.__COZY_PACK__){const bytes=Uint8Array.from(atob(window.__COZY_PACK__.files[id]),(c)=>c.charCodeAt(0));downloadURL=URL.createObjectURL(new Blob([bytes],{type:'model/gltf-binary'}));}
  const link=document.querySelector('#download');link.href=downloadURL??`${import.meta.env.BASE_URL}assets/models/${row.path}`;link.download=`${id}.glb`;
  window.__models={get current(){return current;},get mixer(){return mixer;},get action(){return action;},renderer,scene,camera,show,status:modelStatus(),manifest,get frames(){return frames;}};
}
function play(){mixer?.stopAllAction();action=actions.get(clip.value)??null;if(action){action.enabled=true;action.reset().play();}}
try {
  manifest=window.__COZY_PACK__?.manifest;
  if(!manifest){const r=await fetch(`${import.meta.env.BASE_URL}assets/models/manifest.json`);manifest=await r.json();}
  await loadModels({all:true});
  for(const row of manifest.models)asset.add(new Option(title[row.id]??row.id,row.id));asset.disabled=false;asset.value='girl';await show('girl');
} catch(e){document.querySelector('#error').textContent=e.message;}
let switching=false;
asset.addEventListener('change',async()=>{if(switching)return;switching=true;asset.disabled=true;try{await show(asset.value);}catch(e){document.querySelector('#error').textContent=e.message;}finally{switching=false;asset.disabled=false;}});
clip.addEventListener('change',play);document.querySelector('#pause').addEventListener('click',(e)=>{paused=!paused;e.target.textContent=paused?'Продолжить анимацию':'Остановить анимацию';});
function resize(){renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.setViewOffset(innerWidth,innerHeight,-innerWidth*.12,0,innerWidth,innerHeight);camera.updateProjectionMatrix();}addEventListener('resize',resize);resize();
let last=performance.now();function frame(t){const dt=Math.min(.05,(t-last)/1000);last=t;if(!paused)mixer?.update(dt);controls.update();renderer.render(scene,camera);frames++;requestAnimationFrame(frame);}requestAnimationFrame(frame);
}
bootGallery().catch((e) => { console.error(e); document.body.dataset.error = e.message; });
