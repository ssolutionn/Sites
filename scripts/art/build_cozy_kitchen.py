"""Cozy kitchen furniture at the current game's dimensions, with movable nodes."""
import sys, json, math
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
import build_cozy_assets as C
import bpy

def cabinet(name,width,depth,count):
    C.fresh();os=[]
    tex=C.food_texture(name,(182,134,80),'wood',category='kitchen')
    wood=C.material(name+'_oak','b68650',.57,texture=tex)
    green=C.material(name+'_green','3f8e52',.37)
    def box(label,size,pos,r=.009,segments=2):
        o=C.bevel_box(label,size,pos,wood,r,segments)
        for uv in o.data.uv_layers.active.data:uv.uv.x*=.8
        os.append(o);return o
    box('base',(width,.0+depth,.82),(0,0,.46),.014)
    box('toe_kick',(width-.08,depth-.07,.09),(0,0,.045),.006)
    top=C.bevel_box('countertop',(width+.10,depth+(.06 if name=='back_counter' else .10),.045),(0,0,.8775),green,.016,3);os.append(top)
    cell=(width-.10)/count
    for i in range(count):
        x=-width/2+.05+cell*(i+.5)
        box('door_'+str(i),(cell-.016,.019,.615),(x,-depth/2-.008,.435),.012)
        # A shallow inset panel reads as a cabinet, even from the fixed camera.
        box('panel_'+str(i),(cell-.097,.011,.509),(x,-depth/2-.020,.435),.010)
        box('drawer_'+str(i),(cell-.016,.020,.155),(x,-depth/2-.008,.813),.009)
        for z in [.76,.55]:
            ps=[(x-.073,-depth/2-.027,z),(x-.073,-depth/2-.050,z),(x+.073,-depth/2-.050,z),(x+.073,-depth/2-.027,z)]
            handle=C.tube('handle',ps,.008,green,8);os.append(handle)
    C.export_asset('kitchen',name,[C.join(os,name+'_mesh')],prefix='kit')

def fridge():
    C.fresh();os=[]
    ivory=C.material('fridge_ivory','e9e5d8',.34);metal=C.material('fridge_metal','8c969b',.32,.7)
    body=C.bevel_box('body',(.85,.75,2.0),(0,0,1),ivory,.025,3);os.append(body)
    def door(name,z,h):
        a=C.bevel_box(name,(.81,.025,h),(0,-.3875,z),ivory,.022,3)
        ps=[(-.34,-.410,z-.16),(-.34,-.435,z-.16),(-.34,-.435,z+.16),(-.34,-.410,z+.16)]
        handle=C.tube(name+'_handle',ps,.011,metal,10)
        d=C.join([a,handle],name)
        bpy.context.scene.cursor.location=(.407,-.385,z-h/2)
        bpy.context.view_layer.objects.active=d;bpy.ops.object.origin_set(type='ORIGIN_CURSOR');os.append(d)
    door('door',.683,1.30);door('freezer_door',1.68,.575)
    seam=C.bevel_box('seam',(.815,.008,.008),(0,-.403,1.35),metal,.002,1);os.append(seam)
    C.export_asset('kitchen','fridge',os,prefix='kit')

def stove():
    C.fresh();os=[]
    ivory=C.material('stove_enamel','e6ded0',.32);dark=C.material('stove_metal','41474c',.30,.45)
    body=C.bevel_box('body',(.60,.575,.88),(0,0,.44),ivory,.018,3)
    top=C.bevel_box('cooktop',(.62,.60,.027),(0,0,.9015),dark,.007,3)
    window=C.bevel_box('oven_window',(.46,.016,.29),(0,-.297,.40),dark,.019,3)
    trim=C.bevel_box('oven_front',(.54,.024,.45),(0,-.293,.40),ivory,.017,3)
    os=[body,top,trim,window]
    for x,y in [(-.15,-.14),(.15,-.14),(-.15,.14),(.15,.14)]:
        b=C.lathe('burner',[(.001,.916),(.078,.916),(.080,.920),(.078,.925),(.001,.925)],dark,24)
        b.location=(x,y,0);os.append(b)
    handle=C.tube('oven_handle',[(-.20,-.309,.67),(-.20,-.338,.67),(.20,-.338,.67),(.20,-.309,.67)],.010,dark,10);os.append(handle)
    base=C.join(os,'stove_body');os=[base]
    for i in range(4):
        x=-.21+i*.14
        dial=C.ellipsoid('dial_body',dark,(x,-.309,.793),(.028,.018,.028),16,10)
        mark=C.bevel_box('dial_mark',(.004,.004,.015),(x,-.327,.807),ivory,.001,1)
        d=C.join([dial,mark],'dial_'+str(i))
        bpy.context.scene.cursor.location=(x,-.309,.793)
        bpy.context.view_layer.objects.active=d;bpy.ops.object.origin_set(type='ORIGIN_CURSOR');os.append(d)
    C.export_asset('kitchen','stove',os,prefix='kit')

def sink():
    C.fresh();steel=C.material('sink_steel','b8c4c9',.29,.85);dark=C.material('sink_dark','596665',.6)
    # Elliptical basin with a substantial rim. Origin is the contact plane.
    prof=[(.001,0),(.17,0),(.205,.016),(.232,.095),(.24,.13),(.26,.133),(.26,.143),(.236,.145),(.225,.131),(.207,.097),(.179,.025),(.001,.024)]
    basin=C.lathe('basin',prof,steel,40)
    for v in basin.data.vertices:v.co.y*=.75
    drain=C.lathe('drain',[(.001,.025),(.016,.025),(.018,.026),(.017,.029),(.001,.029)],dark,24)
    ps=[(0,.153,.12),(0,.153,.20),(0,.15,.29),(0,.128,.333),(0,.071,.334),(0,.038,.30),(0,.038,.277)]
    faucet=C.tube('faucet',ps,.012,steel,12)
    lever=C.tube('lever',[(.025,.153,.173),(.042,.153,.184),(.042,.129,.187)],.005,steel,8)
    C.export_asset('kitchen','sink',[C.join([basin,drain,faucet,lever],'sink_mesh')],prefix='kit')

if __name__=='__main__':
    cabinet('island',3.6,.85,4);cabinet('back_counter',5.6,.70,7);fridge();stove();sink()
    p=C.ROOT/'cozy-pack.stats.json';old=json.loads(p.read_text()) if p.exists() else []
    ids={r['id'] for r in C.STATS};old=[r for r in old if r['id'] not in ids]
    p.write_text(json.dumps(old+C.STATS,indent=2))
