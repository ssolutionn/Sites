"""Render the actual exported GLB assets, rather than an independent illustration."""
import bpy, sys, math
from pathlib import Path
from mathutils import Vector

root=Path(__file__).resolve().parents[2]/'assets'
out=Path(__file__).resolve().parents[2]/'production/qa/evidence/cozy-3d';out.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
names=['carrot','potato','potato_peeled','egg','egg_peeled','pickle','beet','onion','tomato','sausage','cheese','bread']
for i,name in enumerate(names):
    before=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(root/'food'/name/(name+'.glb')))
    roots=[o for o in set(bpy.data.objects)-before if o.parent is None]
    for o in roots:o.location=((i%4-1.5)*.31,-(i//4-1)*.24,.033);o.rotation_euler.z=.08*math.sin(i*2)

def mat(name,rgb,rough=.5):
    m=bpy.data.materials.new(name);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*rgb,1);p.inputs['Roughness'].default_value=rough
    return m
wood=mat('oak',(0.28,.17,.080),.7)
bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,.016));board=bpy.context.object;board.dimensions=(1.32,.82,.032);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);board.data.materials.append(wood)
b=board.modifiers.new('soft','BEVEL');b.width=.024;b.segments=4
floor=mat('warm_paper',(.60,.49,.36),.85)
bpy.ops.mesh.primitive_plane_add(size=200);bpy.context.object.data.materials.append(floor)
world=bpy.context.scene.world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.65,.73,.83,1);world.node_tree.nodes['Background'].inputs[1].default_value=.2
for name,pos,power,size,col in [('key',(-1,-1,2),70,1.5,(1,.84,.64)),('fill',(1,-.4,1.4),25,1.2,(.77,.88,1)),('rim',(.3,1,1.6),40,1,(1,.9,.74))]:
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=col
    o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o);o.location=pos;o.rotation_euler=(Vector((0,0,.08))-o.location).to_track_quat('-Z','Y').to_euler()
data=bpy.data.cameras.new('camera');cam=bpy.data.objects.new('camera',data);bpy.context.collection.objects.link(cam);cam.location=(.82,-1.05,1.55);cam.rotation_euler=(Vector((0,0,.04))-cam.location).to_track_quat('-Z','Y').to_euler();data.type='ORTHO';data.ortho_scale=1.5
s=bpy.context.scene;s.camera=cam;s.render.engine='CYCLES';s.cycles.samples=64;s.cycles.use_denoising=False
s.render.resolution_x=1280;s.render.resolution_y=960;s.render.resolution_percentage=100
s.view_settings.view_transform='AgX';s.view_settings.look='AgX - Medium High Contrast';s.view_settings.exposure=-.4;s.render.image_settings.file_format='PNG';s.render.filepath=str(out/'food_pack.png')
# Editable model sources are in assets/food/.
bpy.ops.render.render(write_still=True)
