"""Portraits of the exported models, with the actual imported idle action."""
import bpy, math, sys
from pathlib import Path
from mathutils import Vector
root=Path(__file__).resolve().parents[2]/'assets';out=Path(__file__).resolve().parents[2]/'production/qa/evidence/cozy-3d';out.mkdir(parents=True,exist_ok=True)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(root/'characters/girl/girl.glb'))
rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
for track in rig.animation_data.nla_tracks:track.mute=True
idle=next((a for a in bpy.data.actions if a.name.startswith('idle')),None)
rig.animation_data.action=idle
bpy.context.scene.frame_set(12)

def material(name,c,r=.65):
    m=bpy.data.materials.new(name);m.use_nodes=True;b=m.node_tree.nodes['Principled BSDF'];b.inputs['Base Color'].default_value=(*c,1);b.inputs['Roughness'].default_value=r;return m
bpy.ops.mesh.primitive_plane_add(size=200);bpy.context.object.data.materials.append(material('floor',(.46,.38,.29)))
world=bpy.context.scene.world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.68,.75,.85,1);world.node_tree.nodes['Background'].inputs[1].default_value=.25
for name,pos,power,size,col in [('key',(-2,-3,4),220,3,(1,.84,.68)),('fill',(2,-2,2.5),100,2,(.79,.89,1)),('rim',(.8,2.5,3),190,2,(1,.86,.64))]:
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=col
    o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o);o.location=pos;o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
data=bpy.data.cameras.new('portrait');cam=bpy.data.objects.new('portrait',data);bpy.context.collection.objects.link(cam);cam.location=(2,-5,2.35);cam.rotation_euler=(Vector((0,0,.92))-cam.location).to_track_quat('-Z','Y').to_euler();data.type='ORTHO';data.ortho_scale=2.14
s=bpy.context.scene;s.camera=cam;s.render.engine='CYCLES';s.cycles.samples=48;s.cycles.use_denoising=False
s.render.resolution_x=960;s.render.resolution_y=1200;s.render.resolution_percentage=100
s.view_settings.view_transform='AgX';s.view_settings.look='AgX - Medium High Contrast';s.view_settings.exposure=-.25
s.render.image_settings.file_format='PNG';s.render.filepath=str(out/'girl_threequarter.png')
# Editable model source is assets/characters/girl/girl.blend.
bpy.ops.render.render(write_still=True)
# The same scene can be opened in Blender and checked from front/side/back.
