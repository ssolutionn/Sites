"""Offline smooth-normal CPU rasterization of the actual exported mesh data.
Run export-models.mjs first. This is a model render, not a browser screenshot.
"""
import json,sys
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFilter,ImageFont

SIZE=1300
def normalize(a):return a/np.maximum(np.linalg.norm(a,axis=-1,keepdims=True),1e-9)
def srgb(a):return np.where(a<=.0031308,12.92*a,1.055*np.maximum(a,0)**(1/2.4)-.055)

def render(name):
 data=json.load(open('/tmp/sueta-'+name+'.json'))
 yy,xx=np.mgrid[0:SIZE,0:SIZE];r=np.clip(np.sqrt(((xx-SIZE*.5)/SIZE)**2+((yy-SIZE*.43)/SIZE)**2)*1.25,0,1)[...,None]
 image=(np.array([255,249,236])*(1-r)+np.array([218,234,219])*r).astype(np.float64)
 shadow=Image.new('RGBA',(SIZE,SIZE));dr=ImageDraw.Draw(shadow);dr.ellipse((SIZE*.30,SIZE*.81,SIZE*.73,SIZE*.87),fill=(48,82,54,35));shadow=shadow.filter(ImageFilter.GaussianBlur(SIZE*.016))
 base=Image.fromarray(image.astype('uint8'),'RGB').convert('RGBA');base.alpha_composite(shadow);image=np.array(base.convert('RGB')).astype(np.float64)
 depth=np.full((SIZE,SIZE),np.inf)
 key=normalize(np.array([-.45,.7,.8]));fill=normalize(np.array([.6,.35,-.6]));camera=np.array(data['camera'])
 count=0
 for mesh in data['meshes']:
  ndc=np.array(mesh['projected']).reshape(-1,3);verts=np.array(mesh['positions']).reshape(-1,3);normal=normalize(np.array(mesh['normals']).reshape(-1,3));indices=np.array(mesh['indices']).reshape(-1,3)
  pixels=np.stack(((ndc[:,0]+1)*SIZE/2,(1-ndc[:,1])*SIZE/2,ndc[:,2]),axis=-1)
  lit=.34+.58*np.maximum(0,normal@key)+.16*np.maximum(0,normal@fill)
  half=normalize(normalize(camera-verts)+key)
  spec=np.maximum(0,np.sum(normal*half,axis=-1))**(24 if mesh.get('roughness',.7)>.5 else 70)
  color=np.clip(srgb(np.array(mesh['color'])[None,:]*lit[:,None]+.035*spec[:,None]),0,1)*255
  for triangle in indices:
   t=pixels[triangle];a,b,c=t
   if np.any(t[:,2]>1) or np.any(t[:,2]<-1):continue
   xmin=max(0,int(np.floor(t[:,0].min())));xmax=min(SIZE-1,int(np.ceil(t[:,0].max())))
   ymin=max(0,int(np.floor(t[:,1].min())));ymax=min(SIZE-1,int(np.ceil(t[:,1].max())))
   if xmin>xmax or ymin>ymax:continue
   den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
   if abs(den)<1e-10:continue
   py,px=np.mgrid[ymin:ymax+1,xmin:xmax+1];px=px+.5;py=py+.5
   wa=((b[1]-c[1])*(px-c[0])+(c[0]-b[0])*(py-c[1]))/den
   wb=((c[1]-a[1])*(px-c[0])+(a[0]-c[0])*(py-c[1]))/den;wc=1-wa-wb
   z=wa*a[2]+wb*b[2]+wc*c[2]
   region=depth[ymin:ymax+1,xmin:xmax+1]
   mask=(wa>=-1e-7)&(wb>=-1e-7)&(wc>=-1e-7)&(z<region)
   if not np.any(mask):continue
   rgb=wa[...,None]*color[triangle[0]]+wb[...,None]*color[triangle[1]]+wc[...,None]*color[triangle[2]]
   image[ymin:ymax+1,xmin:xmax+1][mask]=rgb[mask];region[mask]=z[mask];count+=1
 im=Image.fromarray(np.clip(image,0,255).astype('uint8'),'RGB').resize((900,900),Image.Resampling.LANCZOS)
 path=Path('docs/previews')/(name+'.png');im.save(path);print(name,count,flush=True);return im

girl=render('heroine_front');close=render('heroine_worried');cat=render('cat_front')
canvas=Image.new('RGB',(1800,1160),'#f5f3e9');draw=ImageDraw.Draw(canvas)
font_path='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
try:big=ImageFont.truetype(font_path,44);small=ImageFont.truetype(font_path,23)
except OSError:big=small=ImageFont.load_default()
draw.text((50,35),'Новогодняя суета · девушка и кот',font=big,fill='#194c37')
draw.text((52,101),'3D-модели прототипа v0.3 · офлайн-рендер реальной геометрии',font=small,fill='#668172')
canvas.paste(girl,(0,170));canvas.paste(cat.resize((760,760),Image.Resampling.LANCZOS),(965,170))
draw.text((95,1090),'Девушка · кудри, свитер, фартук, анимации',font=small,fill='#355e49')
draw.text((1000,970),'Кот · полоски, усы, лапы, анимации',font=small,fill='#355e49')
canvas.save('docs/previews/models_preview.png')
