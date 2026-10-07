// Sculpted, texture-free festive character. All detail survives a GLB export.
import * as THREE from 'three';
import { material, mesh, ellipsoid, curve, line, snowflake, taperedLimb, group, mergeStaticMeshes } from './model-utils.js';

export function buildHeroine() {
  const root = group(null, 'heroine');
  const body = group(root, 'heroine_body');
  const skin = material(0xf1b992, .58), skinShadow = material(0xd98d71);
  const cream = material(0xffeed5, .92), knit = material(0xe7d3bb, .93);
  const red = material(0xc62c37, .78), stitch = material(0x9e1d2e, .88);
  const dark = material(0x303746, .85), hair = material(0x442619, .7);
  const hairLight = material(0x754126, .65), hairHighlight = material(0x945632, .62);
  const white = material(0xfffaf2, .4), irisMat = material(0x6b4228, .33);
  const pupilMat = material(0x17151c, .38), lipMat = material(0xb84b4b, .57);
  const gold = material(0xe6b548, .3, .7), green = material(0x28784a);

  // Soft fitted knit, using a continuous lathed silhouette rather than blocks.
  const profile = [[.15,.68],[.18,.73],[.184,.85],[.162,.97],[.16,1.1],[.183,1.17],[.17,1.205],[.104,1.235],[.055,1.25]];
  const torso = mesh(new THREE.LatheGeometry(profile.map(([r,y])=>new THREE.Vector2(r,y)),40), cream, body,'heroine_knitted_torso');
  torso.scale.z=.78;
  const neck=mesh(new THREE.CylinderGeometry(.047,.055,.12,20),skin,body,'heroine_neck');neck.position.y=1.26;
  // Ribbed crew collar follows shoulder slope.
  const collar=mesh(new THREE.TorusGeometry(.073,.019,8,40),cream,body,'heroine_collar');
  collar.rotation.x=Math.PI/2;collar.position.y=1.245;collar.scale.z=.7;
  for(let i=0;i<28;i++){const a=i*Math.PI*2/28;line(body,knit,[Math.cos(a)*.071,1.23,Math.sin(a)*.051],[Math.cos(a)*.074,1.255,Math.sin(a)*.053],.0018,'collar_rib');}

  // Legs and comfortable festive flats.
  const legs=[];
  for(const s of [-1,1]){
    const hip=group(body,`heroine_${s<0?'left':'right'}_hip`,[s*.079,.69,0]);
    taperedLimb(hip,dark,.60,.058,.038,'trouser_leg');
    ellipsoid(hip,red,[0,-.61,.047],[.063,.04,.102],'red_slipper');
    ellipsoid(hip,stitch,[0,-.628,.052],[.064,.012,.103],'slipper_sole',20);
    curve(hip,cream,[[-.031,-.596,.084],[0,-.582,.095],[.031,-.596,.084]],.003,'slipper_piping',12);
    legs.push(hip);
  }
  // The skirt/apron has a flared sculpted silhouette and slight cloth waves.
  const skirtGeo=new THREE.LatheGeometry([[.255,.45],[.223,.61],[.19,.73],[.17,.76]].map(([r,y])=>new THREE.Vector2(r,y)),48);
  const skirtPos=skirtGeo.attributes.position;
  for(let i=0;i<skirtPos.count;i++){
    const x=skirtPos.getX(i),z=skirtPos.getZ(i),y=skirtPos.getY(i),a=Math.atan2(x,z);
    const ripple=1+Math.sin(a*10)*.028*(.76-y)/.31;
    skirtPos.setXYZ(i,x*ripple,y,z*ripple);
  }
  skirtGeo.computeVertexNormals();mesh(skirtGeo,red,body,'heroine_apron_skirt');
  // Bib built from an extruded smooth outline, slightly curved in z.
  const bibShape=new THREE.Shape();bibShape.moveTo(-.105,1.155);bibShape.quadraticCurveTo(0,1.125,.105,1.155);
  bibShape.lineTo(.158,.80);bibShape.quadraticCurveTo(0,.765,-.158,.80);bibShape.closePath();
  const bibGeo=new THREE.ExtrudeGeometry(bibShape,{depth:.009,bevelEnabled:true,bevelThickness:.004,bevelSize:.005,bevelSegments:2,steps:1});
  const bibPos=bibGeo.attributes.position;for(let i=0;i<bibPos.count;i++){const x=bibPos.getX(i);bibPos.setZ(i,bibPos.getZ(i)+.151-x*x*1.0);}
  bibGeo.computeVertexNormals();mesh(bibGeo,red,body,'heroine_apron_bib');
  for(const s of [-1,1]){
    curve(body,red,[[s*.086,1.105,.15],[s*.115,1.22,.10],[s*.10,1.255,-.035],[s*.09,1.11,-.145]],.016,'apron_shoulder_strap',20);
    curve(body,cream,[[s*.086,1.105,.169],[s*.113,1.20,.131]],.002,'strap_stitch',12);
  }
  const waist=mesh(new THREE.TorusGeometry(.192,.013,8,48),stitch,body,'apron_waist_tie');waist.rotation.x=Math.PI/2;waist.position.y=.79;waist.scale.y=.83;
  const bow=group(body,'apron_side_bow',[-.194,.79,.025]);
  for(const s of [-1,1]){const b=ellipsoid(bow,red,[s*.031,0,.013],[.034,.026,.014],'apron_bow_loop');b.rotation.z=s*.3;}
  ellipsoid(bow,stitch,[0,0,.03],[.012,.015,.012],'apron_bow_knot');
  for(const s of [-1,1])curve(bow,red,[[s*.01,-.01,.005],[s*.026,-.055,.016],[s*.035,-.105,.012]],.009,'apron_bow_tail',14);
  // Modeled badge and numeral, no raster texture dependencies.
  const badge=mesh(new THREE.TorusGeometry(.049,.0032,8,40),white,body,'apron_badge_outline');badge.position.set(0,1.024,.166);
  const five=curve(body,white,[[.021,1.050,.174],[-.014,1.050,.174],[-.020,1.025,.174],[.010,1.025,.174],[.022,1.014,.174],[.018,.991,.174],[-.009,.986,.174],[-.023,.996,.174]],.006,'apron_badge_five',28);
  curve(body,green,[[.007,1.067,.168],[.023,1.077,.17],[.034,1.065,.171],[.007,1.067,.168]],.004,'apron_badge_leaf',14);
  // Embroidery along exposed chest, skirt and cuffs.
  for(const s of [-1,1]){
    snowflake(body,red,s*.145,1.14,.111,.021,'sweater_snowflake');
    snowflake(body,red,s*.135,.94,.101,.017,'sweater_snowflake');
    for(let j=0;j<3;j++)snowflake(body,cream,s*(.045+j*.07),.52+(j%2)*.045,Math.sqrt(Math.max(0,.242*.242-(.045+j*.07)**2))+.002,.013,'apron_snowflake');
  }
  for(const x of [-.14,0,.14]){
    const tree=group(body,`apron_tree_${x}`,[x,.66,Math.sqrt(.221**2-x*x)+.003]);
    const sh=new THREE.Shape();sh.moveTo(0,.032);sh.lineTo(-.017,.003);sh.lineTo(-.011,.003);sh.lineTo(-.023,-.012);sh.lineTo(.023,-.012);sh.lineTo(.011,.003);sh.lineTo(.017,.003);sh.closePath();
    mesh(new THREE.ExtrudeGeometry(sh,{depth:.002,bevelEnabled:false}),green,tree,'embroidered_tree');
    line(tree,gold,[0,-.012,.003],[0,-.024,.003],.003,'tree_trunk');
  }
  // Apron pocket and double seams.
  curve(body,stitch,[[-.06,.855,.168],[-.05,.812,.173],[0,.80,.174],[.05,.812,.173],[.06,.855,.168]],.004,'apron_pocket',20);
  curve(body,cream,[[-.054,.851,.172],[0,.846,.179],[.054,.851,.172]],.002,'pocket_stitch',12);

  const arms=[];
  for(const s of [-1,1]){
    const shoulder=group(body,`heroine_${s<0?'left':'right'}_shoulder`,[s*.184,1.182,0]);
    shoulder.rotation.z=s*.12;
    taperedLimb(shoulder,cream,.265,.071,.052,'knit_upper_arm');
    const elbow=group(shoulder,`heroine_${s<0?'left':'right'}_elbow`,[0,-.265,0]);
    taperedLimb(elbow,cream,.225,.054,.044,'knit_forearm');
    const cuff=mesh(new THREE.CylinderGeometry(.045,.044,.049,24),cream,elbow,'ribbed_cuff');cuff.position.y=-.216;
    for(let i=0;i<16;i++){const a=i*Math.PI*2/16;line(elbow,knit,[Math.cos(a)*.046,-.192,Math.sin(a)*.046],[Math.cos(a)*.046,-.24,Math.sin(a)*.046],.0017,'cuff_rib');}
    const hand=group(elbow,`heroine_${s<0?'left':'right'}_hand`,[0,-.28,.003]);
    ellipsoid(hand,skin,[0,0,0],[.039,.048,.026],'palm');
    for(let f=0;f<4;f++){
      const fx=(f-1.5)*.015;
      const finger=ellipsoid(hand,skin,[fx,-.044+(f===0||f===3?.006:0),.004],[.009,.024,.010],'finger',16);
      const nail=ellipsoid(hand,material(0xf6cbbb,.45),[fx,-.055+(f===0||f===3?.006:0),.013],[.005,.007,.002],'fingernail',12);
    }
    const thumb=ellipsoid(hand,skin,[s*.038,-.006,.005],[.016,.026,.018],'thumb',16);thumb.rotation.z=s*.4;
    // Embroidered sleeves: snowflakes sit just in front of the curved sleeve.
    snowflake(shoulder,red,0,-.092,.067,.024,'sleeve_snowflake');
    snowflake(elbow,red,0,-.087,.052,.019,'forearm_snowflake');
    for(const yy of [-.03,-.15])curve(elbow,red,[[-.045,yy,.021],[0,yy,.056],[.045,yy,.021]],.004,'sleeve_pattern_band',14);
    body.add(shoulder);arms.push({shoulder,elbow,hand});
  }
  const knife=group(arms[1].elbow,'heroine_knife',[0,-.29,.025]);
  const knifeHandle=mesh(new THREE.CapsuleGeometry(.013,.06,4,12),dark,knife,'knife_handle');knifeHandle.position.y=-.018;
  const bladeShape=new THREE.Shape();bladeShape.moveTo(-.005,-.064);bladeShape.lineTo(-.005,-.218);bladeShape.quadraticCurveTo(.038,-.207,.045,-.064);bladeShape.closePath();
  const blade=mesh(new THREE.ExtrudeGeometry(bladeShape,{depth:.003,bevelEnabled:true,bevelThickness:.001,bevelSize:.001,bevelSegments:1}),material(0xd9e4eb,.24,.8),knife,'knife_blade');
  knife.rotation.x=-1.2;knife.visible=false;
  const phoneProp=mesh(new THREE.BoxGeometry(.067,.122,.009),dark,arms[0].elbow,'heroine_phone');phoneProp.position.set(0,-.3,.034);phoneProp.visible=false;

  // A custom oval face: narrower jaw and gently full cheeks.
  const head=group(body,'heroine_head',[0,1.48,0]);
  const faceGeo=new THREE.SphereGeometry(.175,40,28);const fp=faceGeo.attributes.position;
  for(let i=0;i<fp.count;i++){
    let x=fp.getX(i),y=fp.getY(i),z=fp.getZ(i);const lower=Math.max(0,-y/.175);
    x*=1-.30*lower**1.5;z*=.86;z+=Math.max(0,z)*Math.exp(-(((y+.035)/.07)**2))*.065;y*=1.12;
    fp.setXYZ(i,x,y,z);
  }
  faceGeo.computeVertexNormals();mesh(faceGeo,skin,head,'heroine_sculpted_face');
  // Ears with inset cartilage and gold hoops.
  for(const s of [-1,1]){
    ellipsoid(head,skin,[s*.165,-.018,-.012],[.022,.035,.022],'ear',20);
    ellipsoid(head,skinShadow,[s*.177,-.018,.005],[.011,.021,.006],'ear_cartilage',16);
    const ring=mesh(new THREE.TorusGeometry(.022,.004,8,24),gold,head,'gold_earring');ring.position.set(s*.174,-.064,.015);ring.rotation.y=s*.4;
  }
  const eyes=[],brows=[];
  for(const s of [-1,1]){
    const eye=group(head,`heroine_${s<0?'left':'right'}_eye`,[s*.064,.012,.139]);
    ellipsoid(eye,white,[0,0,0],[.049,.044,.022],'eye_white',28);
    ellipsoid(eye,irisMat,[s*.005,-.001,.019],[.025,.031,.009],'brown_iris',24);
    ellipsoid(eye,pupilMat,[s*.005,-.001,.027],[.0135,.021,.005],'eye_pupil',20);
    ellipsoid(eye,white,[-.008,.014,.033],[.008,.009,.004],'eye_catchlight',12);
    ellipsoid(eye,white,[.011,-.012,.031],[.003,.004,.002],'eye_small_catchlight',10);
    curve(eye,hair,[[-.046,.011,.013],[-.033,.035,.016],[0,.044,.011],[.034,.033,.014],[.047,.011,.012]],.004,'upper_eyelid',20);
    curve(eye,skinShadow,[[-.045,-.011,.01],[0,-.044,.01],[.043,-.015,.012]],.0018,'lower_eyelid',16);
    for(let k=0;k<3;k++)curve(eye,hair,[[s*(.032+k*.005),.027-k*.006,.015],[s*(.052+k*.004),.037-k*.007,.018]],.002,'eyelash',6);
    eyes.push(eye);
    const brow=group(head,`heroine_${s<0?'left':'right'}_brow`,[s*.063,.085,.133]);
    // Curve along local y, so existing expression rotation around z is compatible.
    curve(brow,hair,[[-.002,-.042,0],[-.008,-.023,.007],[-.012,.004,.004],[0,.042,-.007]],.0065,'sculpted_eyebrow',18);
    brow.rotation.z=Math.PI/2+s*.08;brows.push({mesh:brow,side:s});
    ellipsoid(head,material(0xeaa58c,.72),[s*.105,-.05,.128],[.028,.016,.003],'soft_cheek_blush',20);
  }
  ellipsoid(head,skin,[0,-.025,.15],[.017,.026,.026],'nose_bridge',24);
  ellipsoid(head,skin,[0,-.039,.174],[.025,.018,.020],'nose_tip',24);
  for(const s of [-1,1])ellipsoid(head,skinShadow,[s*.014,-.048,.186],[.005,.003,.002],'nostril',12);
  const mouth=group(head,'heroine_smile',[0,-.09,.14]);
  curve(mouth,lipMat,[[-.034,.008,0],[-.020,-.001,.008],[0,-.009,.012],[.020,-.001,.008],[.034,.008,0]],.0045,'smile_lips',20);
  curve(mouth,white,[[-.022,.003,.009],[0,-.003,.014],[.022,.003,.009]],.003,'smile_teeth',14);
  const mouthO=ellipsoid(head,material(0x76323a,.7),[0,-.093,.148],[.018,.023,.005],'surprised_mouth',20);mouthO.visible=false;

  // Chestnut bun and flowing curve-based curls. Face remains clear.
  ellipsoid(head,hair,[0,.056,-.072],[.181,.184,.132],'hair_back_volume',32);
  ellipsoid(head,hair,[0,.223,-.079],[.133,.105,.116],'hair_bun_volume',28);
  // Curls wrap the bun, layered helixes rather than disconnected spheres.
  for(let i=0;i<28;i++){
    const phi=i*2.39996,theta=.38+(i%7)/6*2.2;
    const center=new THREE.Vector3(Math.sin(theta)*Math.cos(phi)*.139,.223+Math.cos(theta)*.111,-.079+Math.sin(theta)*Math.sin(phi)*.122);
    const n=new THREE.Vector3(Math.sin(theta)*Math.cos(phi),Math.cos(theta),Math.sin(theta)*Math.sin(phi));
    const tangent=new THREE.Vector3(0,1,0).cross(n).normalize(),bitangent=n.clone().cross(tangent);
    const pts=[];for(let k=0;k<=30;k++){
      const t=k/30,a=t*Math.PI*3.6,r=.025*(.84+.16*Math.sin(t*Math.PI));
      const p=center.clone().addScaledVector(tangent,Math.cos(a)*r).addScaledVector(bitangent,Math.sin(a)*r).addScaledVector(n,.007+Math.sin(t*Math.PI)*.009);pts.push(p.toArray());
    }
    curve(head,i%4===0?hairHighlight:i%2?hairLight:hair,pts,.009,'bun_ringlet',30);
  }
  // Dense ringlets over the visible bun surface break up the silhouette.
  for(let row=0;row<4;row++)for(let col=0;col<6;col++){
    const xx=(col-2.5)*.038+(row%2)*.008, yy=.174+row*.034;
    const q=1-(xx/.143)**2-((yy-.223)/.115)**2;
    if(q<.05)continue;
    const zz=-.079+.126*Math.sqrt(q),pts=[];
    for(let k=0;k<=24;k++){
      const t=k/24,a=t*Math.PI*3.4,rr=.014+.003*Math.sin(t*Math.PI);
      pts.push([xx+Math.cos(a)*rr,yy+Math.sin(a)*rr,zz+.008+t*.004]);
    }
    curve(head,(row+col)%4===0?hairHighlight:(row+col)%2?hairLight:hair,pts,.0075,'front_bun_ringlet',24);
  }
  // Scalp ridges curve around the crown in deliberate sweeping locks.
  for(let i=0;i<13;i++){
    const x=-.153+i*.0255;
    curve(head,i%3?hair:hairLight,[[x,.062,-.176],[x*.93,.15,-.139],[x*.75,.21,-.063],[x*.58,.16,.036]],.012,'swept_crown_lock',24);
  }
  for(const s of [-1,1]){
    for(let j=0;j<5;j++){
      const pts=[];for(let k=0;k<=28;k++){const t=k/28,a=t*Math.PI*4.3+j*.53;pts.push([s*(.158+j*.004+Math.sin(a)*.014),.093-t*.218,.004+j*.013+Math.cos(a)*.018]);}
      curve(head,j%2?hairLight:hair,pts,.0085,'face_ringlet',28);
    }
    curve(head,hair,[[s*.14,.10,.09],[s*.10,.149,.128],[s*.055,.158,.126],[s*.015,.114,.138]],.022,'side_swept_fringe',24);
    curve(head,hairLight,[[s*.139,.111,.105],[s*.096,.159,.134],[s*.048,.161,.133],[s*.014,.121,.144]],.003,'fringe_highlight',24);
  }
  // Broad red fabric band across the crown; decorative stitches are actual geometry.
  curve(head,red,[[-.176,.086,.009],[-.154,.15,.05],[-.093,.182,.081],[0,.192,.10],[.093,.182,.081],[.154,.15,.05],[.176,.086,.009]],.025,'festive_headband',36);
  for(const x of [-.11,-.055,0,.055,.11]){
    const yy=.19-Math.abs(x)*.12,zz=.124-Math.abs(x)*.24;
    snowflake(head,white,x,yy,zz,.013,'headband_snowflake');
  }
  const bandBow=group(head,'heroine_headband_bow',[-.14,.182,.034]);bandBow.rotation.z=-.35;
  for(const s of [-1,1]){
    const loop=ellipsoid(bandBow,red,[s*.034,.012,0],[.038,.022,.012],'headband_bow_loop');loop.rotation.z=s*.32;
    curve(bandBow,stitch,[[s*.005,.012,.012],[s*.025,.022,.014],[s*.058,.01,.012]],.002,'bow_fold',12);
  }
  ellipsoid(bandBow,stitch,[0,.01,.01],[.012,.017,.013],'headband_bow_knot');
  for(const s of [-1,1])curve(bandBow,red,[[s*.005,.003,0],[s*.027,-.025,.006],[s*.035,-.058,.009]],.012,'headband_bow_ribbon',12);

  root.userData={body,legs,arms,head,eyes,brows,mouth,mouthO,knife,phoneProp};
  mergeStaticMeshes(root,new Set([mouthO,phoneProp]));
  return root;
}
// Позы: на основе игрового состояния, время — только игровое/анимационное.
export function animateHeroine(h, pose, time, progress = 0) {
  const { body, legs, arms, head, brows, mouth, knife, phoneProp } = h.userData;
  const [L, R] = arms;
  // базовые значения
  let legSwing = 0;
  let bob = Math.sin(time * 2.2) * 0.006;
  let la = { x: 0, z: -0.12, ex: -0.15 };
  let ra = { x: 0, z: 0.12, ex: -0.15 };
  let headTilt = Math.sin(time * 1.3) * 0.03;
  knife.visible = false;
  phoneProp.visible = false;

  switch (pose) {
    case 'walk': {
      const ph = time * 11;
      legSwing = Math.sin(ph) * 0.55;
      bob = Math.abs(Math.cos(ph)) * 0.03;
      la.x = -Math.sin(ph) * 0.5;
      ra.x = Math.sin(ph) * 0.5;
      break;
    }
    case 'cut': {
      // правая рука с ножом над доской, удар по прогрессу ножа
      const chop = progress > 0 ? Math.sin(Math.min(progress, 1) * Math.PI) : 0;
      ra = { x: -0.9 + chop * 0.35, z: 0.05, ex: -0.9 - chop * 0.2 };
      la = { x: -1.0, z: -0.25, ex: -0.6 };
      knife.visible = true;
      headTilt = 0.35;
      break;
    }
    case 'work': {
      const w = Math.sin(time * 9) * 0.12;
      la = { x: -1.0 + w, z: -0.2, ex: -0.5 };
      ra = { x: -1.0 - w, z: 0.2, ex: -0.5 };
      headTilt = 0.3;
      break;
    }
    case 'mix': {
      const a = time * 9;
      ra = { x: -1.1 + Math.sin(a) * 0.15, z: 0.15 + Math.cos(a) * 0.15, ex: -0.7 };
      la = { x: -0.8, z: -0.35, ex: -0.9 };
      headTilt = 0.3;
      break;
    }
    case 'reach': {
      // гирлянда: руки вверх
      const w = Math.sin(time * 14) * 0.08;
      la = { x: -2.6 + w, z: -0.1, ex: -0.3 };
      ra = { x: -2.6 - w, z: 0.1, ex: -0.3 };
      headTilt = -0.35;
      break;
    }
    case 'phone': {
      la = { x: -1.3, z: 0.25, ex: -1.6 };
      phoneProp.visible = true;
      headTilt = 0.25;
      break;
    }
    case 'shoo': {
      const w = Math.sin(time * 22) * 0.4;
      la = { x: -2.3, z: -0.4 + w, ex: -0.4 };
      ra = { x: -2.3, z: 0.4 - w, ex: -0.4 };
      bob = Math.abs(Math.sin(time * 14)) * 0.04;
      break;
    }
    case 'joy': {
      const w = Math.sin(time * 6) * 0.25;
      la = { x: -2.7 + w, z: -0.35, ex: -0.2 };
      ra = { x: -2.7 - w, z: 0.35, ex: -0.2 };
      bob = Math.abs(Math.sin(time * 6)) * 0.05;
      headTilt = -0.15;
      break;
    }
    case 'grate': {
      const g = Math.sin(time * 10) * 0.35;
      ra = { x: -1.2 + g, z: 0.1, ex: -0.8 };
      la = { x: -1.0, z: -0.25, ex: -0.5 };
      headTilt = 0.35;
      break;
    }
    case 'wash': {
      const a = time * 8;
      la = { x: -1.1 + Math.sin(a) * 0.12, z: -0.15 + Math.cos(a) * 0.1, ex: -0.6 };
      ra = { x: -1.1 - Math.sin(a) * 0.12, z: 0.15 - Math.cos(a) * 0.1, ex: -0.6 };
      headTilt = 0.4;
      break;
    }
    case 'wipe': {
      const a = time * 7;
      ra = { x: -1.5 + Math.sin(a) * 0.2, z: 0.1 + Math.cos(a) * 0.2, ex: -0.2 };
      la = { x: -0.6, z: -0.3, ex: -0.6 };
      bob = -0.12;
      headTilt = 0.55;
      break;
    }
    case 'unpack': {
      const a = Math.sin(time * 4) * 0.15;
      la = { x: -1.3 + a, z: -0.15, ex: -0.3 };
      ra = { x: -1.3 - a, z: 0.15, ex: -0.3 };
      headTilt = 0.45;
      break;
    }
    case 'stove': {
      ra = { x: -1.3, z: 0.05, ex: -0.4 + Math.sin(time * 3) * 0.1 };
      la = { x: -0.2, z: -0.25, ex: -0.9 };
      headTilt = 0.25;
      break;
    }
    case 'menu': {
      la = { x: -0.3, z: -0.35, ex: -1.4 };
      ra = { x: -0.5, z: 0.3, ex: -1.2 };
      headTilt = Math.sin(time * 1.5) * 0.06;
      break;
    }
    default:
  }

  body.position.y = bob;
  legs[0].rotation.x = legSwing;
  legs[1].rotation.x = -legSwing;
  L.shoulder.rotation.x = la.x;
  L.shoulder.rotation.z = la.z;
  L.elbow.rotation.x = la.ex;
  R.shoulder.rotation.x = ra.x;
  R.shoulder.rotation.z = ra.z;
  R.elbow.rotation.x = ra.ex;
  head.rotation.x = headTilt;
}

// Выражение лица: worried — брови домиком, рот «о».
export function setExpression(h, worried) {
  const { brows, mouth, mouthO } = h.userData;
  for (const b of brows) b.mesh.rotation.z = Math.PI / 2 + (worried ? -0.35 * b.side : 0.08 * b.side);
  mouth.visible = !worried;
  mouthO.visible = worried;
}
