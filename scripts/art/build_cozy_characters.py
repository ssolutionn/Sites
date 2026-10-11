"""Sculpted, skinned characters with authored atlases and in-place actions.

Blender -b --python-exit-code 1 --python this.py -- --root OUTPUT --only characters.
The silhouettes follow the repository's two illustrated references, not a face scan.
"""
import math, sys, json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
import build_cozy_assets as C
import bpy
import numpy as np
from PIL import Image, ImageDraw
from mathutils import Vector

def texture(name, category, size, painter):
    d=(C.ROOT/category/'textures' if category.startswith('characters/') else C.ROOT/category/name/'textures');d.mkdir(parents=True,exist_ok=True)
    im=Image.new('RGB',(size,size));painter(im,ImageDraw.Draw(im))
    p=d/(name+'_basecolor.png');im.save(p);return p

def snow(d,x,y,r,fill):
    for i in range(6):
        a=i*math.tau/6;ex=x+math.sin(a)*r;ey=y+math.cos(a)*r
        d.line((x,y,ex,ey),fill=fill,width=2)
        for sign in [-1,1]:
            bx=x+(ex-x)*.6;by=y+(ey-y)*.6;b=a+sign*.72
            d.line((bx,by,bx+math.sin(b)*r*.33,by+math.cos(b)*r*.33),fill=fill,width=2)

def wardrobe_paint(im,d):
    n=im.width;d.rectangle((0,0,n/2,n),fill='#efe1c6')
    # Fine knit stitches with broad red jacquard bands, visible in the overview.
    for y in range(0,n,8):
        for x in range(0,n//2,6):
            d.line((x,y,x+2,y+3,x+4,y),fill='#e0cead',width=1)
    for y in [int(n*.17),int(n*.75)]:
        d.rectangle((0,y-16,n/2,y+16),fill='#b42f3d')
        for x in range(22,n//2,48):snow(d,x,y,13,'#f7ead2')
    # Right top half (Blender UV v=.5..1): the red apron, separate from the sweater.
    d.rectangle((n/2,0,n,n/2),fill='#b92b3c')
    for y in range(24,n//2,83):
        for x in range(n//2+32,n-12,86):
            if ((x//86)+(y//83))%2:
                snow(d,x,y,11,'#eed8b0')
            else:
                d.polygon([(x,y-18),(x-11,y),(x-6,y),(x-15,y+13),(x+15,y+13),(x+6,y),(x+11,y)],fill='#37684a',outline='#e8c68b')
                d.rectangle((x-2,y+13,x+2,y+20),fill='#d3a96b')
    # Uniform-colour swatches: navy trousers, red shoes, ivory, gold and red headband.
    for i,col in enumerate(['#293b46','#8f2938','#eee1c8','#d2a050','#b82d3a']):
        d.rectangle((n/2+i*n/10,n/2,n/2+(i+1)*n/10,n),fill=col)

def skin_paint(im,d):
    n=im.width;d.rectangle((0,0,n,n),fill='#efba94')
    pix=np.array(im).astype(float);yy,xx=np.mgrid[0:n,0:n]
    for u in [.225,.575]:
        a=.32*np.exp(-(((xx/n-u)/.065)**2+((yy/n-.626)/.045)**2))
        pix=pix*(1-a[:,:,None])+np.array([208,132,118])*a[:,:,None]
    im.paste(Image.fromarray(pix.astype('uint8')))
    d.rectangle((int(n*.8),0,n,int(n*.33)),fill='#c7736c')
    d.rectangle((int(n*.8),int(n*.33),n,int(n*.66)),fill='#e5a084')
    d.rectangle((int(n*.8),int(n*.66),n,n),fill='#734332')

def eye_paint(im,d,iris='#71492d'):
    n=im.width
    for i,c in enumerate(['#f6ecd8',iris,'#271e1b','#f9f0de']):d.rectangle((i*n/4,0,(i+1)*n/4,n),fill=c)

def tile(o,x0,y0,w,h):
    for p in o.data.uv_layers.active.data:p.uv=(x0+p.uv.x*w,y0+p.uv.y*h)
    return o

def bind(o,bone,parts):
    g=o.vertex_groups.new(name=bone);g.add(list(range(len(o.data.vertices))),1,'REPLACE');parts.append(o);return o

def blend_z(o,b0,b1,pivot,width=.075):
    o.vertex_groups.clear();g0=o.vertex_groups.new(name=b0);g1=o.vertex_groups.new(name=b1)
    for v in o.data.vertices:
        z=(o.matrix_world@v.co).z;w=max(0,min(1,(z-pivot+width)/(2*width)))
        if w:g1.add([v.index],w,'REPLACE')
        if w<1:g0.add([v.index],1-w,'REPLACE')

def make_rig(bones):
    data=bpy.data.armatures.new('rig');rig=bpy.data.objects.new('rig',data);bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
    for name,head,tail,parent in bones:
        b=data.edit_bones.new(name);b.head=head;b.tail=tail
        if parent:b.parent=data.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT');rig.show_in_front=True;return rig

def skin_mesh(parts,rig,name):
    o=C.join(parts,name);m=o.modifiers.new('skin','ARMATURE');m.object=rig;o.parent=rig
    return o

def action(rig,name,duration,pose,planted=False):
    bpy.context.view_layer.objects.active=rig
    rig.animation_data_create();a=bpy.data.actions.new(name);rig.animation_data.action=a
    frames=round(duration*30);targets=[];constraints=[];solved=[]
    if planted:
        # Bake Blender IK into ordinary bone tracks. No IK solver is required in Three.js.
        for side in ['l','r']:
            for lower,paw,upper in [('lower_foreleg','forepaw','upper_foreleg'),('calf','hindpaw','thigh')]:
                goal=bpy.data.objects.new('contact_'+paw+'_'+side,None);bpy.context.collection.objects.link(goal)
                goal.location=rig.data.bones[paw+'_'+side].head_local
                ik=rig.pose.bones[lower+'_'+side].constraints.new('IK');ik.target=goal;ik.chain_count=2;ik.use_stretch=False
                targets.append(goal);constraints.append((rig.pose.bones[lower+'_'+side],ik));solved.extend([upper+'_'+side,lower+'_'+side])
    for frame in range(frames+1):
        bpy.context.scene.frame_set(frame)
        t=frame/frames
        values=pose(t)
        for b in rig.pose.bones:
            b.rotation_mode='XYZ'
            v=values.get(b.name,(0,0,0));base=.65 if b.name=='upper_arm_l' else -.65 if b.name=='upper_arm_r' else 0
            b.rotation_euler=(v[0],v[1],v[2]+base);b.location=(0,0,0)
        if planted:
            hips=rig.pose.bones['hips']
            hips.location=hips.bone.matrix_local.to_3x3().inverted()@Vector((0,0,-.075))
            bpy.context.view_layer.update()
            rotations={n:rig.convert_space(pose_bone=rig.pose.bones[n],matrix=rig.pose.bones[n].matrix.copy(),from_space='POSE',to_space='LOCAL').to_euler('XYZ') for n in solved}
            for n,euler in rotations.items():rig.pose.bones[n].rotation_euler=euler
            hips.keyframe_insert('location',frame=frame,group='hips')
        for b in rig.pose.bones:
            if b.name in values or b.name in solved or b.name in ['upper_arm_l','upper_arm_r']:b.keyframe_insert('rotation_euler',frame=frame,group=b.name)
    for bone,ik in constraints:bone.constraints.remove(ik)
    for goal in targets:bpy.data.objects.remove(goal,do_unlink=True)
    for fc in a.fcurves:
        for key in fc.keyframe_points:key.interpolation='LINEAR'
    return a

def girl():
    C.fresh();parts=[]
    outfit=C.material('girl_knit','efe1c6',.88,texture=texture('girl_cloth','characters/girl',1024,wardrobe_paint))
    skin=C.material('girl_skin','efba94',.58,texture=texture('girl_skin','characters/girl',512,skin_paint))
    hair=C.material('girl_hair','553321',.63)
    eyes=C.material('girl_eyes','f6ecd8',.22,texture=texture('girl_eyes','characters/girl',128,lambda im,d:eye_paint(im,d)))
    bones=[('root',(0,0,0),(0,0,.1),None),('hips',(0,0,.77),(0,0,.86),'root'),('spine_01',(0,0,.86),(0,0,.99),'hips'),('spine_02',(0,0,.99),(0,0,1.13),'spine_01'),('spine_03',(0,0,1.13),(0,0,1.22),'spine_02'),('neck',(0,0,1.22),(0,0,1.29),'spine_03'),('head',(0,0,1.29),(0,0,1.55),'neck')]
    for side,sign in [('l',1),('r',-1)]:
        bones += [('shoulder_'+side,(sign*.08,0,1.18),(sign*.18,0,1.18),'spine_03'),('upper_arm_'+side,(sign*.18,0,1.18),(sign*.33,0,.995),'shoulder_'+side),('forearm_'+side,(sign*.33,0,.995),(sign*.44,-.012,.82),'upper_arm_'+side),('hand_'+side,(sign*.44,-.012,.82),(sign*.49,-.02,.755),'forearm_'+side),('socket_hand_'+side,(sign*.467,-.02,.789),(sign*.467,-.02,.805),'hand_'+side),('thigh_'+side,(sign*.085,0,.78),(sign*.085,0,.45),'hips'),('calf_'+side,(sign*.085,0,.45),(sign*.085,0,.105),'thigh_'+side),('foot_'+side,(sign*.085,0,.105),(sign*.085,-.075,.050),'calf_'+side)]
    rig=make_rig(bones)
    shirt=C.lathe('sweater',[(.10,.79),(.151,.83),(.157,.9),(.145,1.0),(.157,1.115),(.172,1.16),(.153,1.205),(.066,1.235),(.062,1.245)],outfit,32)
    for v in shirt.data.vertices:v.co.y*=.64
    tile(shirt,0,0,.625,1);bind(shirt,'spine_01',parts);blend_z(shirt,'spine_01','spine_03',1.04,.17)
    neck=C.ellipsoid('neck',skin,(0,0,1.251),(.044,.041,.071),16,10);C.solid_uv(neck,.3,.5);bind(neck,'neck',parts)
    collar=C.lathe('collar',[(.067,1.235),(.068,1.255),(.049,1.263),(.048,1.241)],outfit,24);tile(collar,0,.84,.6,.07);bind(collar,'neck',parts)
    # Apron follows the torso; the flared skirt stays with the hips.
    vs=[];uv=[];fs=[]
    for i in range(7):
        z=.58+i*.102;half=.19 if i<3 else .166 if i<5 else .116
        for j in range(9):
            x=(j/8*2-1)*half;y=-.087-.037*math.cos((j/8*2-1)*math.pi/2)-.006*math.sin(j*2+i)
            vs.append((x,y,z));uv.append((.52+j/8*.46,.51+i/6*.46))
    for i in range(6):
        for j in range(8):q=i*9+j;fs.append((q,q+1,q+10,q+9))
    apron=C.mesh('apron',vs,fs,outfit,uv);bind(apron,'hips',parts);blend_z(apron,'hips','spine_03',.91,.17)
    for sign in [-1,1]:
        strap=C.tube('apron_strap',[(sign*.078,-.08,1.20),(sign*.083,-.112,1.14),(sign*.08,-.121,1.09)],.011,outfit,6,uv_band=(.94,.22));bind(strap,'spine_03',parts)
    belt=C.lathe('belt',[(.157,.854),(.160,.882),(.159,.887),(.154,.855)],outfit,28,uv_band=(.94,.22));
    for v in belt.data.vertices:v.co.y*=.69
    bind(belt,'hips',parts)
    for side,sign in [('l',1),('r',-1)]:
        leg=C.tube('trousers_'+side,[(sign*.085,0,.78),(sign*.085,0,.69),(sign*.086,0,.45),(sign*.086,0,.25),(sign*.086,-.005,.075)],[.069,.066,.058,.047,.039],outfit,16,uv_band=(.55,.20));bind(leg,'thigh_'+side,parts);blend_z(leg,'calf_'+side,'thigh_'+side,.45,.07)
        shoe=C.ellipsoid('shoe_'+side,outfit,(sign*.086,-.037,.048),(.060,.100,.048),20,12);C.solid_uv(shoe,.65,.20);bind(shoe,'foot_'+side,parts)
        arm=C.tube('sleeve_'+side,[(sign*.18,0,1.177),(sign*.24,0,1.113),(sign*.33,0,.995),(sign*.399,-.01,.88),(sign*.437,-.012,.825)],[.066,.060,.053,.045,.041],outfit,16);tile(arm,0,0,.625,1);bind(arm,'upper_arm_'+side,parts);blend_z(arm,'forearm_'+side,'upper_arm_'+side,.995,.07)
        cuff=C.ellipsoid('cuff_'+side,outfit,(sign*.434,-.01,.839),(.043,.044,.041),16,8);tile(cuff,0,.75,.6,.035);bind(cuff,'forearm_'+side,parts)
        palm=C.ellipsoid('palm_'+side,skin,(sign*.465,-.014,.793),(.034,.024,.045),16,10);C.solid_uv(palm,.3,.5);bind(palm,'hand_'+side,parts)
        for i in range(4):
            finger=C.tube('finger_'+side+str(i),[(sign*(.462+i*.009),-.028,.774),(sign*(.467+i*.009),-.030,.756),(sign*(.468+i*.009),-.025,.743)],[.008,.007,.004],skin,6,uv_band=(.3,.5));bind(finger,'hand_'+side,parts)
        thumb=C.ellipsoid('thumb_'+side,skin,(sign*.438,-.029,.791),(.012,.013,.029),12,8);C.solid_uv(thumb,.3,.5);bind(thumb,'hand_'+side,parts)
    head=C.ellipsoid('face',skin,(0,-.012,1.445),(.151,.118,.179),32,24)
    for v in head.data.vertices:
        # A soft jaw/chin and broad cheek plane, rather than a perfectly round ball.
        if v.co.z<-.035:v.co.x*=1-.25*(-v.co.z-.035)/.144
        if v.co.y<0:v.co.y*=.93
    for poly in head.data.polygons:
        for loop in poly.loop_indices:
            p=head.data.vertices[head.data.loops[loop].vertex_index].co
            head.data.uv_layers.active.data[loop].uv=(.4+.3*p.x/.151,.5+.47*p.z/.179)
    bind(head,'head',parts)
    nose=C.ellipsoid('nose',skin,(0,-.128,1.430),(.019,.027,.023),16,12);C.solid_uv(nose,.3,.5);bind(nose,'head',parts)
    for sign in [-1,1]:
        ear=C.ellipsoid('ear',skin,(sign*.148,-.005,1.436),(.027,.018,.043),16,10);C.solid_uv(ear,.3,.5);bind(ear,'head',parts)
        # Thin, inset eyes; the eyelids do not form oversized goggle rims.
        eye=C.ellipsoid('eye_white',eyes,(sign*.059,-.108,1.478),(.040,.013,.037),24,14);C.solid_uv(eye,.12,.5);bind(eye,'head',parts)
        iris=C.ellipsoid('iris',eyes,(sign*.058,-.122,1.477),(.022,.0035,.023),20,10);C.solid_uv(iris,.37,.5);bind(iris,'head',parts)
        pupil=C.ellipsoid('pupil',eyes,(sign*.058,-.125,1.477),(.011,.0018,.015),16,8);C.solid_uv(pupil,.62,.5);bind(pupil,'head',parts)
        light=C.ellipsoid('eye_glint',eyes,(sign*.058-.006,-.127,1.488),(.0045,.001,.005),10,6);C.solid_uv(light,.87,.5);bind(light,'head',parts)
        browpts=[(sign*(.021+.075*k/10),-.108+.013*(k/10),1.525+.015*math.sin(k/10*math.pi)) for k in range(11)]
        brow=C.tube('brow',browpts,[.0035+.0015*math.sin(k/10*math.pi) for k in range(11)],hair,6);bind(brow,'head',parts)
        lashpts=[(sign*(.021+.077*k/12),-.118+.012*k/12,1.483+.034*math.sin(k/12*math.pi)) for k in range(13)]
        lash=C.tube('upper_lid',lashpts,.0024,hair,5);bind(lash,'head',parts)
        hooppts=[(sign*.164+.019*math.cos(math.tau*k/20),-.017,1.390+.023*math.sin(math.tau*k/20)) for k in range(21)]
        hoop=C.tube('earring',hooppts,.0027,outfit,6,uv_band=(.85,.20));bind(hoop,'head',parts)
    mouth=C.tube('smile',[(-.031,-.119,1.373),(-.016,-.128,1.363),(0,-.131,1.360),(.016,-.128,1.363),(.031,-.119,1.373)],.0035,skin,6,uv_band=(.90,.12));bind(mouth,'head',parts)
    lip=C.ellipsoid('lower_lip',skin,(0,-.127,1.357),(.019,.004,.0045),16,6);C.solid_uv(lip,.90,.85);bind(lip,'head',parts)
    # Sculpted curl masses with individual tapered ringlets; no alpha hair cards.
    cap=C.ellipsoid('hair_cap',hair,(0,.015,1.522),(.159,.129,.120),24,16)
    for v in cap.data.vertices:
        if v.co.y<0 and v.co.z<.035:v.co.y*=.68
    bind(cap,'head',parts)
    bun=C.ellipsoid('bun',hair,(.010,.045,1.681),(.079,.065,.077),20,14);bind(bun,'head',parts)
    for i in range(40):
        zz=1-2*(i+.5)/40;a=i*2.399963;rr=math.sqrt(1-zz*zz)
        cx=.010+.086*rr*math.cos(a);cy=.045+.071*rr*math.sin(a);cz=1.681+.077*zz
        clump=C.ellipsoid('curl_mass',hair,(cx,cy,cz),(.027,.024,.025),12,8);bind(clump,'head',parts)
        normal=Vector((rr*math.cos(a),rr*math.sin(a),zz)).normalized()
        tangent=normal.cross(Vector((0,0,1)) if abs(zz)<.9 else Vector((1,0,0))).normalized()
        bitangent=normal.cross(tangent)
        ps=[tuple(Vector((cx,cy,cz))+normal*.023+tangent*(.018*math.cos(k*.5))+bitangent*(.016*math.sin(k*.5))) for k in range(13)]
        curl=C.tube('bun_curl',ps,[.0045*(1-.4*k/12) for k in range(13)],hair,5);bind(curl,'head',parts)
    for sign in [-1,1]:
        for j in range(4):
            ps=[(sign*(.158+.017*math.sin(k*.65+j)), -.043-.025*math.cos(k*.65+j),1.562-k*.011-j*.008) for k in range(14)]
            curl=C.tube('loose_curl',ps,[.005*(1-.5*k/13) for k in range(14)],hair,5);bind(curl,'head',parts)
    # Swept forehead curl, leaving the face open.
    fore=C.tube('forelock',[(-.105,-.075,1.579),(-.052,-.099,1.598),(.013,-.102,1.585),(.060,-.098,1.560)], [.024,.024,.019,.012],hair,12);bind(fore,'head',parts)
    band=C.lathe('headband',[(.156,1.574),(.158,1.596),(.154,1.603),(.153,1.575)],outfit,36,uv_band=(.94,.20))
    for v in band.data.vertices:v.co.y=v.co.y*.77+.013
    bind(band,'head',parts)
    for sign in [-1,1]:
        bow=C.ellipsoid('bow',outfit,(-.109+sign*.021,-.088,1.604),(.030,.009,.016),16,8);C.solid_uv(bow,.94,.20);bind(bow,'head',parts)
    knot=C.ellipsoid('bow_knot',outfit,(-.109,-.10,1.602),(.011,.011,.012),12,8);C.solid_uv(knot,.94,.20);bind(knot,'head',parts)
    body=skin_mesh(parts,rig,'girl_mesh')
    # Face keys operate only on their authored regions of the joined mesh.
    body.shape_key_add(name='Basis')
    for name in ['blink','smile','worried','mouth_o']:
        key=body.shape_key_add(name=name)
        for i,v in enumerate(body.data.vertices):
            p=v.co
            if name=='blink' and abs(p.x)>.019 and abs(p.x)<.101 and p.y<-.106 and 1.435<p.z<1.519:
                key.data[i].co.z=1.478+(p.z-1.478)*.10
            if name=='worried' and .016<abs(p.x)<.102 and p.y<-.08 and 1.52<p.z<1.552:
                key.data[i].co.z+=.014*(1-min(1,abs(p.x)/.10))
            if name=='smile' and abs(p.x)<.037 and p.y<-.113 and 1.350<p.z<1.382:
                key.data[i].co.z+=.005*abs(p.x)/.037
            if name=='mouth_o' and abs(p.x)<.037 and p.y<-.113 and 1.350<p.z<1.382:
                key.data[i].co.x*=.60;key.data[i].co.z=1.366+(p.z-1.366)*1.6
    clips=[]
    def add(name,duration,fn):action(rig,name,duration,fn);clips.append(name)
    add('idle',3,lambda t:{'spine_02':(.008*math.sin(t*math.tau),0,.012*math.sin(t*math.tau))})
    def walking(t):
        a=math.sin(t*math.tau);return {'thigh_l':(.43*a,0,0),'thigh_r':(-.43*a,0,0),'calf_l':(.35*max(0,-a),0,0),'calf_r':(.35*max(0,a),0,0),'upper_arm_l':(-.25*a,0,0),'upper_arm_r':(.25*a,0,0),'spine_02':(0,.02*a,.035*a)}
    add('walk',.6,walking)
    def working(t):return {'upper_arm_l':(-.25,0,-.10),'upper_arm_r':(-.4,.10*math.sin(t*math.tau),.15),'forearm_l':(-.65,0,0),'forearm_r':(-.75+.12*math.cos(t*math.tau),0,0),'head':(.09,0,0)}
    for n in ['stir','work','wash','wipe','grate','stove','unpack']:add(n,1,working)
    add('cut',.6,lambda t:{'upper_arm_r':(-.38,0,.14),'forearm_r':(-.72+.30*math.sin(t*math.pi),0,0),'upper_arm_l':(-.24,0,-.10),'forearm_l':(-.65,0,0),'head':(.12,0,0)})
    add('carry',1,lambda t:{'upper_arm_l':(-.45,0,-.15),'upper_arm_r':(-.45,0,.15),'forearm_l':(-.7,0,0),'forearm_r':(-.7,0,0)})
    add('shoo',.5,lambda t:{'upper_arm_r':(-1.0,0,.45),'forearm_r':(-.8,0,.5*math.sin(t*math.tau)),'head':(0,-.15,0)})
    add('celebrate',2,lambda t:{'upper_arm_l':(-1.1,0,-.4),'upper_arm_r':(-1.1,0,.4),'forearm_l':(-.5,0,0),'forearm_r':(-.5,0,0),'spine_02':(0,0,.05*math.sin(t*math.tau))})
    add('phone_answer',.8,lambda t:{'upper_arm_l':(-.85*t,0,-.32*t),'forearm_l':(-1.5*t,0,0),'head':(0,0,-.06*t)})
    add('open_fridge',1.2,lambda t:{'upper_arm_r':(-.55*math.sin(t*math.pi/2),0,.14),'forearm_r':(-.45*math.sin(t*math.pi/2),0,0)})
    add('taste',1.5,lambda t:{'upper_arm_r':(-.68*math.sin(t*math.pi),0,.18),'forearm_r':(-1.3*math.sin(t*math.pi),0,0),'head':(.1*math.sin(t*math.pi),0,0)})
    add('reach_up',1,lambda t:{'upper_arm_r':(-1.5*t,0,.1),'forearm_r':(-.25,0,0)})
    rig.animation_data.action=None
    for bone in rig.pose.bones:bone.rotation_euler=(0,0,0);bone.location=(0,0,0)
    bpy.context.scene.frame_set(0)
    C.export_asset('characters/girl','girl',[body,rig],prefix='char',clips=clips)

def fur_paint(im,d):
    n=im.width
    yy,xx=np.mgrid[0:n,0:n];u=xx/n;v=yy/n
    stripe=np.exp(-((np.sin(v*math.tau*6+1.2*np.sin(u*11)+.5*np.cos(u*29))/.38)**2))*(.4+.6*np.sin(u*17)**2)
    variation=3*np.sin(u*161)*np.sin(v*139)
    rgb=np.clip(np.array([209,126,55])[None,None,:]-stripe[:,:,None]*np.array([27,18,9])+variation[:,:,None],0,255).astype(np.uint8)
    im.paste(Image.fromarray(rgb))
    d.rectangle((n*.82,0,n,n*.5),fill='#f0dfc1')
    d.rectangle((n*.82,n*.5,n,n*.75),fill='#75442d')
    d.rectangle((n*.82,n*.75,n,n),fill='#c6817f')

def cat():
    C.fresh();parts=[]
    fur=C.material('cat_fur','d17e37',.82,texture=texture('cat_fur','characters/cat',1024,fur_paint))
    eyes=C.material('cat_eyes','f3ead5',.23,texture=texture('cat_eyes','characters/cat',128,lambda im,d:eye_paint(im,d,'#729344')))
    bones=[('root',(0,0,0),(0,0,.1),None),('hips',(0,.14,.23),(0,.06,.25),'root'),('spine_01',(0,.06,.25),(0,-.07,.27),'hips'),('neck',(0,-.07,.27),(0,-.19,.32),'spine_01'),('head',(0,-.19,.32),(0,-.19,.43),'neck'),('jaw',(0,-.23,.27),(0,-.30,.25),'head'),('socket_mouth',(0,-.313,.273),(0,-.313,.284),'jaw')]
    for side,sign in [('l',1),('r',-1)]:
        bones += [('upper_foreleg_'+side,(sign*.105,-.12,.25),(sign*.101,-.15,.14),'spine_01'),('lower_foreleg_'+side,(sign*.101,-.15,.14),(sign*.101,-.17,.055),'upper_foreleg_'+side),('forepaw_'+side,(sign*.101,-.17,.055),(sign*.101,-.21,.026),'lower_foreleg_'+side),('thigh_'+side,(sign*.105,.14,.22),(sign*.111,.17,.125),'hips'),('calf_'+side,(sign*.111,.17,.125),(sign*.110,.155,.045),'thigh_'+side),('hindpaw_'+side,(sign*.110,.155,.045),(sign*.110,.11,.025),'calf_'+side),('ear_'+side,(sign*.087,-.19,.421),(sign*.093,-.20,.495),'head')]
    tailpts=[(0,.23,.255),(0,.32,.28),(.012,.365,.365),(.024,.341,.45),(.024,.29,.493),(.010,.25,.465),(.008,.265,.428)]
    for i in range(6):bones.append(('tail_'+str(i),tailpts[i],tailpts[i+1],'hips' if i==0 else 'tail_'+str(i-1)))
    rig=make_rig(bones)
    body=C.ellipsoid('body',fur,(0,.019,.235),(.147,.236,.133),24,16);tile(body,0,0,.8,1);bind(body,'spine_01',parts)
    # A white chest and plump neck connect the head to the torso.
    neck=C.ellipsoid('neck',fur,(0,-.127,.285),(.105,.099,.097),20,14);tile(neck,0,0,.8,1);bind(neck,'neck',parts)
    chest=C.ellipsoid('bib',fur,(0,-.178,.222),(.072,.018,.082),20,12);C.solid_uv(chest,.92,.80);bind(chest,'neck',parts)
    head=C.ellipsoid('head',fur,(0,-.210,.355),(.131,.106,.123),28,20);tile(head,0,0,.8,1);bind(head,'head',parts)
    for side,sign in [('l',1),('r',-1)]:
        leg=C.tube('foreleg_'+side,[(sign*.105,-.12,.249),(sign*.104,-.135,.205),(sign*.103,-.145,.16),(sign*.102,-.158,.11),(sign*.10,-.175,.050)],[.043,.041,.037,.032,.025],fur,12);tile(leg,0,0,.8,1);bind(leg,'upper_foreleg_'+side,parts);blend_z(leg,'lower_foreleg_'+side,'upper_foreleg_'+side,.145,.035)
        paw=C.ellipsoid('forepaw_'+side,fur,(sign*.101,-.191,.034),(.037,.051,.034),16,10);C.solid_uv(paw,.92,.80);bind(paw,'forepaw_'+side,parts)
        thigh=C.ellipsoid('haunch_'+side,fur,(sign*.105,.14,.185),(.060,.076,.078),20,12);tile(thigh,0,0,.8,1);bind(thigh,'thigh_'+side,parts)
        shin=C.tube('shin_'+side,[(sign*.11,.17,.13),(sign*.11,.165,.096),(sign*.11,.155,.050)],[.033,.030,.026],fur,12);tile(shin,0,0,.8,1);bind(shin,'calf_'+side,parts)
        paw=C.ellipsoid('hindpaw_'+side,fur,(sign*.11,.128,.034),(.039,.052,.034),16,10);C.solid_uv(paw,.92,.80);bind(paw,'hindpaw_'+side,parts)
        # Triangular ears have volume, rounded bases and visible pink inner planes.
        vs=[(sign*.049,-.215,.419),(sign*.131,-.193,.416),(sign*.100,-.201,.502),(sign*.049,-.168,.419),(sign*.131,-.157,.416),(sign*.100,-.176,.502)]
        ear=C.mesh('ear_'+side,vs,[(0,1,2),(3,5,4),(0,3,4,1),(1,4,5,2),(2,5,3,0)],fur,[(.4,.55)]*6);bind(ear,'ear_'+side,parts)
        inner=C.mesh('ear_inner_'+side,[(sign*.061,-.214,.428),(sign*.120,-.198,.426),(sign*.099,-.204,.485)],[(0,1,2)],fur,[(.92,.15)]*3);bind(inner,'ear_'+side,parts)
        cheek=C.ellipsoid('muzzle_'+side,fur,(sign*.027,-.306,.289),(.045,.023,.031),20,12);C.solid_uv(cheek,.92,.80);bind(cheek,'head',parts)
        white=C.ellipsoid('eye_white_'+side,eyes,(sign*.056,-.293,.367),(.043,.013,.043),24,14);C.solid_uv(white,.12,.5);bind(white,'head',parts)
        iris=C.ellipsoid('iris_'+side,eyes,(sign*.056,-.304,.368),(.026,.0035,.030),20,12);C.solid_uv(iris,.37,.5);bind(iris,'head',parts)
        pupil=C.ellipsoid('pupil_'+side,eyes,(sign*.056,-.307,.368),(.008,.0015,.023),16,10);C.solid_uv(pupil,.62,.5);bind(pupil,'head',parts)
        glint=C.ellipsoid('glint_'+side,eyes,(sign*.056-.008,-.309,.383),(.0055,.001,.006),10,6);C.solid_uv(glint,.87,.5);bind(glint,'head',parts)
        for j in range(3):
            pts=[(sign*(.036+.025*k),-.312+.003*k,.288+(j-1)*.012+(j-1)*.002*k) for k in range(5)]
            whisker=C.tube('whisker_'+side+str(j),pts,.0007,fur,4,uv_band=(.92,.80));bind(whisker,'head',parts)
        for j in range(2):
            toes=C.tube('toe_'+side+str(j),[(sign*.101-.012+j*.013,-.226,.042),(sign*.101-.012+j*.013,-.229,.025)],.0009,fur,4,uv_band=(.92,.4));bind(toes,'forepaw_'+side,parts)
    nose=C.mesh('nose',[(-.015,-.329,.312),(.015,-.329,.312),(0,-.338,.298),(-.012,-.322,.311),(.012,-.322,.311),(0,-.330,.299)],[(0,1,2),(3,5,4),(0,3,4,1),(1,4,5,2),(2,5,3,0)],fur,[(.92,.15)]*6);bind(nose,'head',parts)
    for sign in [-1,1]:
        smile=C.tube('mouth',[(0,-.331,.299),(0,-.327,.283),(sign*.011,-.322,.278),(sign*.02,-.315,.281)],.0018,fur,5,uv_band=(.92,.4));bind(smile,'jaw',parts)
    chin=C.ellipsoid('chin',fur,(0,-.296,.260),(.035,.020,.022),16,10);C.solid_uv(chin,.92,.80);bind(chin,'jaw',parts)
    ps=[]
    for i in range(6):
        for j in range(4):ps.append(tuple(Vector(tailpts[i]).lerp(Vector(tailpts[i+1]),j/4)))
    ps.append(tailpts[-1])
    tail=C.tube('tail',ps,[.024-.013*i/(len(ps)-1) for i in range(len(ps))],fur,8)
    bind(tail,'tail_0',parts);tail.vertex_groups.clear()
    groups=[tail.vertex_groups.new(name='tail_'+str(i)) for i in range(6)]
    for v in tail.data.vertices:
        ring=min(len(ps)-1,v.index//8); q=max(0,min(5,ring/4-.5)); lo=int(q); hi=min(5,lo+1); w=q-lo
        groups[lo].add([v.index],1-w,'REPLACE')
        if w:groups[hi].add([v.index],w,'REPLACE')
    body=skin_mesh(parts,rig,'cat_mesh');body.shape_key_add(name='Basis')
    for name in ['blink','mouth_open']:
        key=body.shape_key_add(name=name)
        for i,v in enumerate(body.data.vertices):
            p=v.co
            if name=='blink' and .015<abs(p.x)<.104 and p.y<-.289 and .327<p.z<.408:key.data[i].co.z=.368+(p.z-.368)*.08
            if name=='mouth_open' and abs(p.x)<.04 and p.y<-.29 and .252<p.z<.298:key.data[i].co.z-=.009
    clips=[]
    def add(name,d,fn,planted=False):action(rig,name,d,fn,planted);clips.append(name)
    add('idle',3,lambda t:{'tail_2':(0,0,.13*math.sin(t*math.tau)),'ear_l':(.04*math.sin(t*math.tau),0,0),'spine_01':(.008*math.sin(t*math.tau),0,0)})
    def walk(t):
        a=math.sin(t*math.tau);return {'upper_foreleg_l':(.40*a,0,0),'upper_foreleg_r':(-.40*a,0,0),'thigh_l':(-.36*a,0,0),'thigh_r':(.36*a,0,0),'tail_1':(0,0,.08*a),'head':(.012*a,0,0)}
    add('walk',.45,walk);add('steal_run',.4,lambda t:{k:tuple(vv*1.3 for vv in v) for k,v in walk(t).items()})
    add('sit',3,lambda t:{'hips':(-.25,0,0),'tail_2':(0,0,.07*math.sin(t*math.tau))},planted=True)
    add('sleep',4,lambda t:{'head':(.2,0,.17),'neck':(.35,0,0),'spine_01':(.09,0,.12),'tail_1':(0,0,.4),'upper_foreleg_l':(-.35,0,0),'upper_foreleg_r':(-.35,0,0)})
    add('eat',1,lambda t:{'neck':(.28+.05*math.sin(t*math.tau),0,0),'head':(.18,0,0),'jaw':(.08*max(0,math.sin(t*math.tau)),0,0)})
    add('reach',1,lambda t:{'upper_foreleg_r':(-.55,0,.12),'lower_foreleg_r':(-.45+.14*math.sin(t*math.tau),0,0),'head':(-.07,0,-.03)})
    add('knock_over',1.2,lambda t:{'upper_foreleg_r':(-.65*math.sin(t*math.pi),0,.4*math.sin(t*math.pi)),'lower_foreleg_r':(-.5,0,0),'head':(-.06,0,0)})
    add('meow',.8,lambda t:{'jaw':(.22*math.sin(t*math.pi),0,0),'head':(-.04*math.sin(t*math.pi),0,0)})
    add('jump_up',.35,lambda t:{'upper_foreleg_l':(-.5*math.sin(t*math.pi),0,0),'upper_foreleg_r':(-.5*math.sin(t*math.pi),0,0),'thigh_l':(.6*math.sin(t*math.pi),0,0),'thigh_r':(.6*math.sin(t*math.pi),0,0)})
    rig.animation_data.action=None
    for bone in rig.pose.bones:bone.rotation_euler=(0,0,0);bone.location=(0,0,0)
    bpy.context.scene.frame_set(0)
    C.export_asset('characters/cat','cat',[body,rig],prefix='char',clips=clips)
    (C.ROOT/'characters/cat/cat.clips.json').write_text(json.dumps({'knock_over':{'contact':.55}},indent=2))

if __name__=='__main__':
    girl();cat()
    p=C.ROOT/'cozy-pack.stats.json';old=json.loads(p.read_text()) if p.exists() else []
    ids={r['id'] for r in C.STATS};old=[r for r in old if r['id'] not in ids]
    p.write_text(json.dumps(old+C.STATS,indent=2))
