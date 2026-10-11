"""Reproducible game meshes. Blender 4.3: -b -t 2 --python this.py -- --root OUTPUT.

All dimensions are metres. Source coordinates: Z up, front -Y; glTF exports Y up.
Textures are authored here, packed into .blend and embedded into uncompressed GLB.
"""
import argparse, json, math, random, struct, sys
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector
from PIL import Image, ImageDraw, ImageFilter

args = argparse.ArgumentParser()
args.add_argument('--root', default=str(Path(__file__).resolve().parents[2]/'assets'))
args.add_argument('--only', default='food,props')
opts = args.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
ROOT = Path(opts.root).resolve()
TAU = math.tau
STATS = []
bpy.context.preferences.filepaths.save_version = 0

def linear(c):
    return c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4

def color(code):
    return tuple(linear(int(code[i:i+2], 16) / 255) for i in (0, 2, 4)) + (1,)

def fresh():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.images, bpy.data.armatures, bpy.data.actions):
        for x in list(block):
            if x.users == 0: block.remove(x)
    s = bpy.context.scene
    s.unit_settings.system = 'METRIC'
    s.unit_settings.scale_length = 1
    s.render.fps = 30

def material(name, hexcode, rough=.6, metal=0, texture=None):
    m = bpy.data.materials.new('m_' + name)
    m.use_nodes = True
    bs = m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = color(hexcode)
    bs.inputs['Roughness'].default_value = rough
    bs.inputs['Metallic'].default_value = metal
    if texture:
        img = bpy.data.images.load(str(texture), check_existing=True)
        img.pack()
        n = m.node_tree.nodes.new('ShaderNodeTexImage'); n.image = img
        m.node_tree.links.new(n.outputs['Color'], bs.inputs['Base Color'])
        normal_path=Path(str(texture).replace('_basecolor.png','_normal.png'))
        if normal_path.exists():
            normal_image=bpy.data.images.load(str(normal_path),check_existing=True);normal_image.colorspace_settings.name='Non-Color';normal_image.pack()
            tn=m.node_tree.nodes.new('ShaderNodeTexImage');tn.image=normal_image
            normal=m.node_tree.nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.45
            m.node_tree.links.new(tn.outputs['Color'],normal.inputs['Color']);m.node_tree.links.new(normal.outputs['Normal'],bs.inputs['Normal'])
    return m

def mesh(name, verts, faces, mat, uv=None):
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces); data.update()
    obj = bpy.data.objects.new(name, data); bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    for p in data.polygons: p.use_smooth = True
    layer = data.uv_layers.new(name='uv')
    for p in data.polygons:
        for loop in p.loop_indices:
            vi = data.loops[loop].vertex_index
            coord = uv[vi] if uv else (.9, .1)
            if uv and max(uv[j][0] for j in p.vertices)-min(uv[j][0] for j in p.vertices) > .6 and coord[0] < .01:
                coord = (.8, coord[1])
            layer.data[loop].uv = coord
    return obj

def solid_uv(obj, u=.92, v=.1):
    if not obj.data.uv_layers: obj.data.uv_layers.new(name='uv')
    for p in obj.data.uv_layers.active.data: p.uv = (u, v)
    return obj

def ellipsoid(name, mat, loc, scale, n=20, rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=n, ring_count=rings, location=loc)
    o = bpy.context.object; o.name = name; o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(mat)
    if o.data.uv_layers.active:o.data.uv_layers.active.name='uv'
    for p in o.data.polygons: p.use_smooth = True
    return o

def tube(name, points, radii, mat, sides=8, uv_band=None):
    vs, uvs, fs = [], [], []
    previous_a = None
    for i, p in enumerate(points):
        p = Vector(p)
        tangent = Vector(points[min(i+1, len(points)-1)]) - Vector(points[max(i-1, 0)])
        tangent.normalize()
        seed = Vector((0,0,1)) if abs(tangent.z) < .9 else Vector((1,0,0))
        a = (previous_a - tangent * previous_a.dot(tangent)).normalized() if previous_a is not None else tangent.cross(seed).normalized()
        previous_a = a.copy(); b = tangent.cross(a).normalized()
        r = radii[i] if isinstance(radii, (list,tuple)) else radii
        for j in range(sides):
            vs.append(tuple(p + r*(a*math.cos(TAU*j/sides)+b*math.sin(TAU*j/sides))))
            uvs.append((.8*j/sides, i/(len(points)-1)) if uv_band is None else uv_band)
    for i in range(len(points)-1):
        for j in range(sides):
            q = i*sides+j; j1=(j+1)%sides
            fs.append((q,i*sides+j1,(i+1)*sides+j1,q+sides))
    fs += [tuple(reversed(range(sides))), tuple((len(points)-1)*sides+j for j in range(sides))]
    return mesh(name, vs, fs, mat, uvs)

def lathe(name, profile, mat, n=32, uv_band=None):
    vs, fs, uvs=[],[],[]
    for k,(r,z) in enumerate(profile):
        for j in range(n):
            a=TAU*j/n
            vs.append((r*math.cos(a),r*math.sin(a),z))
            uvs.append((.8*j/n,k/(len(profile)-1)) if uv_band is None else uv_band)
    if profile[0][0] > .01 and profile[-1][0] > .01:
        # Close the profile into an annulus, without capping the bowl opening.
        for j in range(n):
            j1=(j+1)%n;fs.append(((len(profile)-1)*n+j,(len(profile)-1)*n+j1,j1,j))
    else:
        fs += [tuple(reversed(range(n))), tuple((len(profile)-1)*n+j for j in range(n))]
    for k in range(len(profile)-1):
        for j in range(n):
            j1=(j+1)%n; fs.append((k*n+j,k*n+j1,(k+1)*n+j1,(k+1)*n+j))
    return mesh(name,vs,fs,mat,uvs)

def bevel_box(name, size, loc, mat, radius=.008, segments=3):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o=bpy.context.object; o.name=name; o.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(mat)
    if o.data.uv_layers.active:o.data.uv_layers.active.name='uv'
    mod=o.modifiers.new('soft_edges','BEVEL');mod.width=radius;mod.segments=segments
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.object.shade_smooth()
    return o

def join(objects, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.object.join(); o=bpy.context.object;o.name=name
    # Preserve origin at the contact plane, while applying object transforms.
    bpy.context.scene.cursor.location=(0,0,0)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
    return o

def normalize_skin_roots(path):
    """glTF ignores parent transforms of skinned meshes: emit them as scene roots.

    Our authoring parents are identity transforms. Joints stay under the character
    root; the runtime instances the complete glTF scene, moving mesh and joints together.
    BIN offsets are relative to their chunk and remain unchanged.
    """
    raw=path.read_bytes();length,kind=struct.unpack_from('<II',raw,12)
    if kind!=0x4e4f534a:raise ValueError('Expected JSON chunk')
    doc=json.loads(raw[20:20+length]);nodes=doc.get('nodes',[])
    parents={child:i for i,node in enumerate(nodes) for child in node.get('children',[])}
    changed=False
    for i,node in enumerate(nodes):
        if 'skin' not in node or i not in parents:continue
        chain=[i];p=parents.get(i)
        while p is not None:chain.append(p);p=parents.get(p)
        for n in chain:
            obj=nodes[n]
            if obj.get('translation',[0,0,0])!=[0,0,0] or obj.get('rotation',[0,0,0,1])!=[0,0,0,1] or obj.get('scale',[1,1,1])!=[1,1,1] or 'matrix' in obj:
                raise ValueError('Cannot flatten nonidentity skin authoring transform')
        nodes[parents[i]]['children'].remove(i)
        for scene in doc['scenes']:
            if chain[-1] in scene.get('nodes',[]):scene['nodes'].append(i)
        changed=True
    if changed:
        payload=json.dumps(doc,separators=(',',':')).encode();payload+=b' '*((-len(payload))%4)
        rest=raw[20+length:];body=struct.pack('<II',len(payload),0x4e4f534a)+payload+rest
        path.write_bytes(struct.pack('<III',0x46546c67,2,12+len(body))+body)

def export_asset(category, name, objects, prefix=None, clips=None):
    directory=(ROOT/category if category.startswith('characters/') else ROOT/category/name);directory.mkdir(parents=True,exist_ok=True)
    bpy.context.view_layer.update()
    if category in ['food','props']:
        bottom=min((o.matrix_world@Vector(v)).z for o in objects if o.type=='MESH' for v in o.bound_box)
        for o in objects:o.location.z-=bottom
        bpy.context.view_layer.update()
    root=bpy.data.objects.new((prefix or category.rstrip('s'))+'_'+name,None)
    bpy.context.collection.objects.link(root)
    for o in objects:
        if o.parent not in objects:o.parent=root
    bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
    for o in objects:
        o.select_set(True)
        for child in o.children_recursive:child.select_set(True)
    bpy.context.view_layer.objects.active=root
    bpy.ops.wm.save_as_mainfile(filepath=str(directory/(name+'.blend')),compress=True)
    # Ngon caps prevent Blender from calculating tangent frames for normal maps.
    if not clips:
        for o in objects:
            if o.type=='MESH':
                bpy.context.view_layer.objects.active=o
                tri=o.modifiers.new('export_triangles','TRIANGULATE')
                bpy.ops.object.modifier_apply(modifier=tri.name)
    bpy.ops.export_scene.gltf(filepath=str(directory/(name+'.glb')),export_format='GLB',use_selection=True,
        export_yup=True,export_texcoords=True,export_normals=True,export_tangents=True,export_materials='EXPORT',
        export_animations=bool(clips),export_animation_mode='ACTIONS',export_force_sampling=True,
        export_optimize_animation_size=True,export_optimize_animation_keep_anim_armature=True,
        export_skins=True,export_morph=True,export_morph_normal=True,export_extras=True,
        export_vertex_color='NONE')
    if clips:normalize_skin_roots(directory/(name+'.glb'))
    triangles=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in objects if o.type=='MESH')
    matnames=set(m.name for o in objects if o.type=='MESH' for m in o.data.materials)
    bounds=[tuple(o.matrix_world@Vector(v)) for o in objects if o.type=='MESH' for v in o.bound_box]
    dims=[max(p[i] for p in bounds)-min(p[i] for p in bounds) for i in range(3)] if bounds else []
    row=dict(id=name,category=category,triangles=triangles,materials=len(matnames),bytes=(directory/(name+'.glb')).stat().st_size,dimensions_blender=dims,clips=clips or [])
    STATS.append(row);print('ASSET',json.dumps(row),flush=True)
    if clips:(directory/(name+'.clips.json')).write_text(json.dumps({},indent=2))

def food_texture(name, base, kind, category='food'):
    d=ROOT/category/name/'textures';d.mkdir(parents=True,exist_ok=True)
    size=512;yy,xx=np.mgrid[0:size,0:size];u=xx/size;v=yy/size
    rng=np.random.default_rng(sum(ord(c) for c in name));noise=rng.normal(0,1,(size,size))
    variation=2.0*noise+3*np.sin(u*31)*np.sin(v*17)
    if kind=='carrot':variation+=-12*np.exp(-((np.sin(v*72+u*4)/.08)**2))+3*np.sin(u*155)
    if kind=='potato':
        variation+=5*np.sin(u*47+np.cos(v*18))*np.cos(v*35)
        for q,r in [(.12,.24),(.37,.65),(.61,.43),(.22,.81),(.65,.84)]:
            dist=((u-q)/.011)**2+((v-r)/.015)**2;variation-=42*np.exp(-dist)
    if kind=='pickle':variation+=-12*(np.sin(u*100)*np.sin(v*86)> .92)+6*np.sin(u*52+v*3)
    if kind=='beet':variation+=-8*np.sin(v*36+u*5)**12+4*np.sin(u*91)
    if kind=='onion':variation+=-20*np.exp(-((np.sin(u*TAU*15)/.1)**2))
    if kind=='bread':variation+=4*noise-35*(rng.random((size,size))>.98)
    if kind=='sausage':
        variation+=4*np.sin(u*80)*np.sin(v*96)
    if kind=='wood':variation+=7*np.sin(v*90+1.5*np.sin(u*9))+3*np.sin(v*245+u*5)
    rgb=np.clip(np.array(base)[None,None,:]+variation[:,:,None],0,255).astype(np.uint8)
    # Rightmost atlas strip: green foliage, cream flesh, yellow yolk, brown stem.
    rgb[:,int(size*.82):]=(64,104,34)
    rgb[:128,int(size*.82):]=(238,220,172)
    rgb[128:256,int(size*.82):]=(239,180,45)
    rgb[256:384,int(size*.82):]=(103,67,38)
    p=d/(name+'_basecolor.png');Image.fromarray(rgb).save(p)
    # Authored OpenGL normal map: soft wrinkles/pores, not a runtime procedural shader.
    normal_size=128 if kind=='bread' else 256
    heights=Image.fromarray(np.clip(127+variation*2,0,255).astype(np.uint8)).resize((normal_size,normal_size)).filter(ImageFilter.GaussianBlur(.7))
    gy,gx=np.gradient(np.asarray(heights).astype(float)/255)
    nn=np.dstack((-gx*1.5,gy*1.5,np.ones_like(gx)));nn/=np.linalg.norm(nn,axis=2)[:,:,None]
    normal_rgb=np.clip((nn+1)*127.5,0,255).astype(np.uint8);normal_rgb[:,int(normal_size*.82):]=(128,128,255)
    Image.fromarray(normal_rgb).save(d/(name+'_normal.png'))
    return p

def foods():
    for name,base,kind in [
        ('carrot',(225,114,26),'carrot'),('potato',(170,130,76),'potato'),
        ('potato_peeled',(236,213,161),'flesh'),('egg',(239,225,200),'shell'),
        ('egg_peeled',(248,239,216),'flesh'),('pickle',(64,86,31),'pickle'),
        ('beet',(117,39,69),'beet'),('onion',(198,147,77),'onion'),
        ('tomato',(199,52,32),'tomato'),('sausage',(212,134,140),'sausage'),
        ('cheese',(238,197,92),'cheese'),('bread',(201,150,86),'bread')]:
        fresh();tex=food_texture(name,base,kind)
        rough={'carrot':.55,'potato':.78,'potato_peeled':.65,'pickle':.42,'tomato':.32,'bread':.85}.get(name,.28 if name.startswith('egg') else .62)
        mat=material(name,'eddbba',rough,texture=tex)
        os=[]
        if name=='carrot':
            ps=[(-.105+.21*k/17,0,.027+.003*math.sin(k/17*math.pi)) for k in range(18)]
            rs=[.026*(.12+.88*(1-k/17)**.6) for k in range(18)]
            os.append(tube('root',ps,rs,mat,sides=16))
            for j in range(3):
                pts=[(-.103-.024*k, math.sin(j*2.1)*.006*k,.029+.007*k) for k in range(4)]
                os.append(tube('leaf_'+str(j),pts,[.002,.002,.0012,.0001],mat,sides=4,uv_band=(.92,.1)))
        elif name in ['potato','potato_peeled','pickle']:
            scale=(.057,.034,.029) if name.startswith('potato') else (.073,.022,.021)
            o=ellipsoid('root',mat,(0,0,scale[2]),scale,20,14)
            for vtx in o.data.vertices:
                p=vtx.co;fac=1+.025*math.sin(p.x*93)*math.cos(p.y*116)
                p.x*=fac;p.y*=fac
            # Restrict sphere UVs to the skin region of the atlas.
            for uv in o.data.uv_layers.active.data:uv.uv.x*=.8
            os.append(o)
        elif name.startswith('egg'):
            profile=[]
            for k in range(19):
                a=math.pi*k/18;r=.022*math.sin(a)*(1-.13*math.cos(a));z=.029*(1-math.cos(a))
                profile.append((max(.00001,r),z))
            os.append(lathe('shell' if name=='egg' else 'white',profile,mat,20))
        elif name in ['beet','onion','tomato']:
            o=ellipsoid('body',mat,(0,0,.039),(.044,.040,.039),20,14)
            for uv in o.data.uv_layers.active.data:uv.uv.x*=.8
            if name=='tomato':
                for vtx in o.data.vertices:
                    p=vtx.co; p.z-=.003*(1-abs(p.x)/.044)*max(0,p.z/.039)
            os.append(o)
            if name=='beet':os.append(tube('taproot',[(.032,0,.014),(.049,0,.008),(.067,.006,.001)],[.008,.004,.0002],mat,6))
            for j in range(4 if name=='tomato' else 2):
                a=j*TAU/4
                os.append(tube('stem_'+str(j),[(0,0,.072),(.013*math.cos(a),.013*math.sin(a),.077),(.026*math.cos(a),.026*math.sin(a),.069)],[.003,.002,.0001],mat,4,uv_band=(.92,.1 if name!='onion' else .4)))
        elif name=='sausage':
            os.append(tube('sausage',[(-.09,0,.033),(-.075,0,.033),(.075,0,.033),(.09,0,.033)],[.019,.033,.033,.025],mat,24))
            end=ellipsoid('cut',mat,(.0905,0,.033),(.0008,.029,.029),16,8)
            for uv in end.data.uv_layers.active.data:uv.uv.x*=.8
            os.append(end)
        elif name=='cheese':
            o=bevel_box('block',(.11,.065,.044),(0,0,.022),mat,.004)
            for uv in o.data.uv_layers.active.data:uv.uv.x*=.8
            os.append(o)
        else:
            o=ellipsoid('loaf',mat,(0,0,.055),(.135,.053,.055),20,14)
            for uv in o.data.uv_layers.active.data:uv.uv.x*=.8
            os.append(o)
        combined=join(os,'food_'+name+'_mesh')
        export_asset('food',name,[combined],prefix='food')

def props():
    for name in ['board','knife','bowl','cat_bowl','pot','grater','star_ornament','heart_ornament']:
        fresh();os=[]
        ceramic=material(name+'_cream','f5ead5',.23)
        accent=material(name+'_berry','b72d3b',.36)
        if name=='board':
            tex=food_texture(name,(182,136,86),'wood',category='props');wood=material(name+'_wood','b58a54',.68,texture=tex)
            os.append(bevel_box('board',(.60,.40,.03),(0,0,.015),wood,.016))
            for uv in os[0].data.uv_layers.active.data:uv.uv.x*=.8
        elif name=='knife':
            steel=material('knife_steel','d5dce0',.25,1)
            handle=material('knife_handle','704629',.65)
            # Long axis Y. Cutting edge is the bottom, front tip points Blender +Y / glTF -Z.
            os.append(mesh('blade',[(-.0018,-.025,.035),(.0018,-.025,.035),(-.0012,.13,.029),(.0012,.13,.029),(-.0003,-.025,0),(.0003,-.025,0),(0,.13,.002)],[(0,2,6,4),(1,5,6,3),(0,1,3,2),(4,6,5),(0,4,5,1)],steel))
            os.append(bevel_box('handle',(.024,.10,.029),(0,-.075,.024),handle,.008))
            for y in [-.105,-.065]:os.append(ellipsoid('rivet',steel,(.0121,y,.024),(.001,.003,.003),8,6))
        elif name in ['bowl','cat_bowl']:
            r=.21 if name=='bowl' else .105;h=.14 if name=='bowl' else .038
            prof=[(.001,.003),(r*.5,.003),(r*.56,.008),(r*.68,h*.22),(r*.87,h*.68),(r,h*.96),(r,h),(r-.006,h+.001),(r-.012,h*.95),(r*.81,h*.65),(r*.62,h*.2),(r*.48,.014),(.001,.014)]
            os.append(lathe('body',prof,ceramic,40))
            os.append(lathe('rim',[(r-.009,h*.95),(r,h*.96),(r,h+.001),(r-.006,h+.002)],accent,40))
        elif name=='pot':
            enamel=material('pot_enamel','486d64',.26);steel=material('pot_steel','c8cbd0',.3,1)
            prof=[(.001,.004),(.125,.004),(.141,.009),(.148,.025),(.150,.17),(.15,.195),(.145,.20),(.139,.195),(.14,.025),(.123,.016),(.001,.016)]
            os.append(lathe('body',prof,enamel,36))
            for side in [-1,1]:
                ps=[(side*.144,0,.158),(side*.182,0,.164),(side*.198,0,.149),(side*.180,0,.136),(side*.145,0,.141)]
                os.append(tube('handle_'+str(side),ps,.007,steel,8))
            base=join(os,'pot_body');os=[base]
            lid=lathe('lid',[(.001,.207),(.065,.210),(.131,.205),(.152,.199),(.152,.194),(.128,.198),(.001,.202)],enamel,36)
            knob=ellipsoid('knob',steel,(0,0,.221),(.022,.015,.013),16,8)
            lid=join([lid,knob],'lid')
            bpy.context.scene.cursor.location=(0,0,.194);bpy.context.view_layer.objects.active=lid
            bpy.ops.object.origin_set(type='ORIGIN_CURSOR');os.append(lid)
        elif name=='grater':
            steel=material('grater_steel','a6b0b5',.42,.9)
            os.append(bevel_box('body',(.075,.052,.105),(0,0,.0525),steel,.004))
            os.append(tube('grip',[(-.028,0,.10),(-.028,0,.125),(.028,0,.125),(.028,0,.10)],.005,accent,8))
            # Teeth are recess-coloured sculpted slots, not expensive booleans.
            for i in range(4):
                for j in range(5):
                    os.append(bevel_box('tooth',(.009,.0025,.006),(-.024+i*.016,-.027,.025+j*.014),steel,.001,segments=1))
        else:
            gold=material(name+'_gold','dbaf55',.3,.65)
            if name=='star_ornament':
                pts=[(math.sin(TAU*i/10)*(.045 if i%2==0 else .022),math.cos(TAU*i/10)*(.045 if i%2==0 else .022)) for i in range(10)]
                vs=[(0,-.011,.047),(0,.011,.047)]+[(x,0,.047+z) for x,z in pts]
                fs=[(0,2+i,2+(i+1)%10) for i in range(10)]+[(1,2+(i+1)%10,2+i) for i in range(10)]
                os.append(mesh('star',vs,fs,gold))
            else:
                os.append(ellipsoid('heart_l',accent,(-.013,0,.049),(.020,.009,.026),16,10))
                os.append(ellipsoid('heart_r',accent,(.013,0,.049),(.020,.009,.026),16,10))
                os.append(mesh('heart_tip',[(-.026,-.006,.049),(.026,-.006,.049),(0,-.006,.010),(-.026,.006,.049),(.026,.006,.049),(0,.006,.010)],[(0,1,2),(3,5,4),(0,3,4,1),(1,4,5,2),(2,5,3,0)],accent))
            ps=[(.006*math.cos(TAU*k/16),0,.098+.006*math.sin(TAU*k/16)) for k in range(17)]
            os.append(tube('loop',ps,.0015,gold if name=='star_ornament' else accent,6))
        if name!='pot':os=[join(os,'prop_'+name+'_mesh')]
        if name=='knife':
            # Root is under the middle of the cutting edge, not at the handle end.
            for vertex in os[0].data.vertices:vertex.co.y-=.0525
            grip=bpy.data.objects.new('grip',None);bpy.context.collection.objects.link(grip);grip.location=(0,-.075,.025);os.append(grip)
            grip.location.y-=.0525
        export_asset('props',name,os,prefix='prop')

if __name__=='__main__':
    targets=opts.only.split(',')
    if 'food' in targets:foods()
    if 'props' in targets:props()
    ROOT.mkdir(parents=True,exist_ok=True)
    p=ROOT/'cozy-pack.stats.json'; old=json.loads(p.read_text()) if p.exists() else []
    ids={r['id'] for r in STATS}
    p.write_text(json.dumps([r for r in old if r['id'] not in ids]+STATS,ensure_ascii=False,indent=2))
