// Orange tabby sculpt, with fully modeled coat markings and curved whiskers.
import * as THREE from 'three';
import { material, mesh, ellipsoid, curve, line, taperedLimb, group, mergeStaticMeshes } from './model-utils.js';

export function buildCat(){
  const root=group(null,'cat'),body=group(root,'cat_body');
  const orange=material(0xe89648,.82),furLight=material(0xf1ac61,.84);
  const cream=material(0xffefd2,.92),stripe=material(0xae582d,.83);
  const pink=material(0xe68d94,.63),pinkDark=material(0xa65661,.66);
  const iris=material(0x90bd70,.4),irisRim=material(0x4e7b4e,.54),black=material(0x26231f,.48);
  const white=material(0xffffff,.4);
  const torso=ellipsoid(body,orange,[0,.207,-.005],[.137,.132,.219],'cat_torso',32);
  ellipsoid(body,cream,[0,.168,.058],[.092,.089,.145],'cat_cream_belly',28);
  ellipsoid(body,orange,[0,.228,-.136],[.135,.135,.111],'cat_haunch',28);
  // Stripe arcs hug the elliptical torso, following its transverse sections.
  for(let j=0;j<5;j++){
    const z=-.14+j*.065,r=Math.sqrt(Math.max(.1,1-((z+.005)/.22)**2));
    for(const s of [-1,1]){
      const pts=[];for(let k=0;k<=16;k++){const a=.15+k/16*1.85;pts.push([s*Math.sin(a)*.138*r,.207+Math.cos(a)*.133*r,z+Math.sin(k/16*Math.PI)*.005]);}
      curve(body,stripe,pts,.007+(j%2)*.002,'cat_flank_stripe',20);
    }
  }
  // A cream bib leads up to the broad expressive face.
  ellipsoid(body,cream,[0,.275,.158],[.073,.088,.055],'cat_chest_bib',24);
  const head=group(body,'cat_head',[0,.345,.187]);
  const faceGeo=new THREE.SphereGeometry(.117,36,24),pos=faceGeo.attributes.position;
  for(let i=0;i<pos.count;i++){
    let x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
    x*=1.12+(y<0?.08:0);y*=.94;z*=.88;
    pos.setXYZ(i,x,y,z);
  }
  faceGeo.computeVertexNormals();mesh(faceGeo,furLight,head,'cat_sculpted_face');
  // Proper pointed ears with slightly bent tips and soft beveled edges.
  for(const s of [-1,1]){
    const ear=group(head,`cat_${s<0?'left':'right'}_ear`,[s*.080,.073,-.009]);ear.rotation.z=-s*.17;
    const shape=new THREE.Shape();shape.moveTo(-.041,0);shape.quadraticCurveTo(-.030,.048,-.017,.089);shape.quadraticCurveTo(-.008,.098,.003,.084);shape.quadraticCurveTo(.031,.050,.043,.006);shape.quadraticCurveTo(0,-.019,-.041,0);
    const g=new THREE.ExtrudeGeometry(shape,{depth:.025,bevelEnabled:true,bevelThickness:.009,bevelSize:.007,bevelSegments:3,curveSegments:10});mesh(g,orange,ear,'cat_outer_ear');
    const inner=new THREE.Shape();inner.moveTo(-.026,.010);inner.quadraticCurveTo(-.023,.046,-.009,.074);inner.quadraticCurveTo(.014,.044,.028,.013);inner.quadraticCurveTo(0,0,-.026,.010);
    const inn=mesh(new THREE.ExtrudeGeometry(inner,{depth:.002,bevelEnabled:true,bevelThickness:.002,bevelSize:.002,bevelSegments:2}),pink,ear,'cat_inner_ear');inn.position.z=.036;
    for(let k=0;k<3;k++)curve(ear,cream,[[s*(.022+k*.006),.012,.040],[s*(.011+k*.006),.030+k*.004,.041]],.0017,'ear_fur',8);
  }
  // Large green eyes have lids, dark irises, slit pupils and two catchlights.
  const eyes=[];
  for(const s of [-1,1]){
    const eye=group(head,`cat_${s<0?'left':'right'}_eye`,[s*.049,.029,.084]);eye.rotation.z=s*.10;
    ellipsoid(eye,cream,[0,0,0],[.037,.039,.014],'cat_eye_white',24);
    ellipsoid(eye,irisRim,[0,0,.012],[.028,.034,.008],'cat_iris_rim',24);
    ellipsoid(eye,iris,[0,0,.018],[.024,.030,.005],'cat_green_iris',24);
    ellipsoid(eye,black,[0,0,.023],[.007,.025,.003],'cat_slit_pupil',20);
    ellipsoid(eye,white,[-.009,.012,.028],[.007,.008,.003],'cat_eye_glint',12);
    ellipsoid(eye,white,[.009,-.012,.026],[.003,.003,.002],'cat_eye_glint_small',8);
    curve(eye,stripe,[[-.033,.006,.008],[-.021,.032,.009],[0,.039,.007],[.025,.027,.008],[.034,.006,.007]],.0028,'cat_upper_lid',16);
    curve(head,stripe,[[s*.074,.073,.058],[s*.051,.081,.074],[s*.031,.069,.087]],.005,'cat_brow',14);
    eyes.push(eye);
  }
  // Paired muzzle lobes read as feline rather than a single spherical snout.
  for(const s of [-1,1]){
    ellipsoid(head,cream,[s*.032,-.037,.085],[.040,.032,.035],'cat_muzzle',24);
    for(let k=0;k<3;k++)ellipsoid(head,pinkDark,[s*(.026+k*.012),-.028-(k%2)*.012,.116-k*.005],[.0018,.0018,.001],'whisker_follicle',8);
    for(let k=0;k<3;k++){
      const y=-.034-k*.012;
      curve(head,cream,[[s*.034,y,.119],[s*.081,y+.005,.123],[s*.151,y+.029-k*.023,.119]],.00125,'cat_whisker',14);
    }
    curve(head,cream,[[s*.057,.065,.072],[s*.071,.093,.081],[s*.093,.108,.078]],.0012,'cat_eyebrow_whisker',12);
  }
  ellipsoid(head,cream,[0,-.066,.069],[.031,.016,.028],'cat_chin',20);
  const noseShape=new THREE.Shape();noseShape.moveTo(-.015,0);noseShape.quadraticCurveTo(0,.007,.015,0);noseShape.quadraticCurveTo(.006,-.015,0,-.014);noseShape.quadraticCurveTo(-.006,-.015,-.015,0);
  const nose=mesh(new THREE.ExtrudeGeometry(noseShape,{depth:.004,bevelEnabled:true,bevelThickness:.002,bevelSize:.002,bevelSegments:2}),pink,head,'cat_nose');nose.position.set(0,-.022,.122);
  line(head,pinkDark,[0,-.039,.124],[0,-.049,.119],.0018,'cat_philtrum');
  for(const s of [-1,1])curve(head,pinkDark,[[0,-.049,.119],[s*.013,-.058,.112],[s*.024,-.049,.112]],.0018,'cat_smile',10);
  // Forehead M and cheek tabby markings.
  for(const s of [-1,1]){
    curve(head,stripe,[[s*.053,.086,.048],[s*.034,.101,.045],[s*.014,.069,.085],[0,.087,.069]],.005,'cat_forehead_M',20);
    curve(head,stripe,[[s*.094,.001,.064],[s*.109,-.008,.043],[s*.115,-.024,.023]],.006,'cat_cheek_stripe',14);
    curve(head,stripe,[[s*.096,-.038,.063],[s*.115,-.050,.028]],.0045,'cat_lower_cheek_stripe',12);
  }
  const legs=[];
  for(const [i,[x,z]] of [[-.083,.123],[.083,.123],[-.084,-.134],[.084,-.134]].entries()){
    const hip=group(body,`cat_leg_${i}`,[x,.175,z]);
    taperedLimb(hip,orange,.143,.034,.024,'cat_lower_leg');
    ellipsoid(hip,cream,[0,-.143,.018],[.038,.027,.047],'cat_white_paw',20);
    for(let toe=-1;toe<=1;toe++){
      ellipsoid(hip,cream,[toe*.016,-.145,.046],[.012,.019,.018],'cat_toe',12);
      if(toe<1)curve(hip,material(0xd7c5a8),[[toe*.016+.008,-.155,.057],[toe*.016+.008,-.143,.062]],.001,'cat_toe_seam',6);
    }
    for(const y of [-.03,-.07])curve(hip,stripe,[[-.026,y,.012],[0,y-.008,.032],[.026,y,.012]],.004,'cat_leg_stripe',12);
    legs.push(hip);
  }
  const tailPivot=group(body,'cat_tail_pivot',[0,.235,-.185]);
  const tailPts=[];for(let i=0;i<=32;i++){const t=i/32;tailPts.push([Math.sin(t*3.1)*.08,t*.35,-Math.sin(t*2.8)*.11]);}
  const tail=curve(tailPivot,orange,tailPts,.028,'cat_curved_tail',40);
  // Concentric local rings orient to the curve tangent; all are exportable meshes.
  const tailCurve=new THREE.CatmullRomCurve3(tailPts.map(p=>new THREE.Vector3(...p)));
  for(let i=0;i<7;i++){
    const t=.10+i*.125,p=tailCurve.getPointAt(t),tangent=tailCurve.getTangentAt(t);
    const ring=mesh(new THREE.TorusGeometry(.028,.005,6,18),stripe,tailPivot,'cat_tail_ring');ring.position.copy(p);ring.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),tangent);
  }
  const tip=tailCurve.getPointAt(1);ellipsoid(tailPivot,cream,tip.toArray(),[.027,.031,.027],'cat_tail_tip',20);
  const loot=mesh(new THREE.BoxGeometry(.055,.026,.035),material(0xd78b89),head,'cat_stolen_sausage');loot.position.set(0,-.071,.115);loot.visible=false;
  root.userData={body,head,legs,tailPivot,loot,eyes};root.scale.setScalar(1.1);mergeStaticMeshes(root,new Set([loot]));
  return root;
}
export function animateCat(cat, mode, time, speed = 0) {
  const { body, head, legs, tailPivot } = cat.userData;
  const ph = time * 14;
  const walking = speed > 0.01;
  legs.forEach((l, i) => (l.rotation.x = walking ? Math.sin(ph + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.7 : 0));
  tailPivot.rotation.z = Math.sin(time * 4) * 0.25;
  body.rotation.x = 0;
  body.position.y = walking ? Math.abs(Math.sin(ph)) * 0.015 : 0;
  head.rotation.x = 0;
  if (mode === 'reach') {
    // встаёт и тянет лапу
    body.rotation.x = -0.55;
    body.position.y = 0.06;
    legs[0].rotation.x = -1.6 + Math.sin(time * 9) * 0.35;
    legs[1].rotation.x = -0.4;
    head.rotation.x = 0.45;
  }
  if (mode === 'eat') {
    // ест из миски: голова вниз, покачивание
    body.rotation.x = 0.12;
    head.rotation.x = 0.75 + Math.sin(time * 7) * 0.12;
  }
  if (mode === 'sleep') {
    // свернулся и спит
    body.rotation.x = -0.05;
    body.position.y = -0.05 + Math.sin(time * 1.6) * 0.004;
    legs.forEach((l) => (l.rotation.x = -1.3));
    head.rotation.x = 0.55;
    tailPivot.rotation.z = Math.sin(time * 0.8) * 0.08;
  }
  if (mode === 'play') {
    // прыгает за мячиком
    body.position.y = Math.abs(Math.sin(time * 5)) * 0.06;
    body.rotation.x = -0.2 + Math.sin(time * 5) * 0.2;
    legs[0].rotation.x = -0.9 + Math.sin(time * 10) * 0.5;
    legs[1].rotation.x = -0.9 - Math.sin(time * 10) * 0.5;
  }
  if (mode === 'sit') {
    body.rotation.x = -0.35;
    legs[2].rotation.x = -0.9;
    legs[3].rotation.x = -0.9;
    head.rotation.x = 0.25 + Math.sin(time * 1.4) * 0.05;
  }
}
