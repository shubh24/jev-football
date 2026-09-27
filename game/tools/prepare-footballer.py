"""Run with Blender --background --python tools/prepare-footballer.py -- SOURCE_DIR OUTPUT_GLB.
Source: Quaternius Universal Base Characters Standard, CC0. No animation is downloaded.
"""
import bpy,bmesh,sys,os,json
from mathutils import Vector
args=sys.argv[sys.argv.index('--')+1:];source,out=args
bpy.ops.wm.read_factory_settings(use_empty=True)
base=os.path.join(source,'Base Characters','Godot - UE')
# The publisher uses some duplicate image names in the glTF references.
for folder,_,files in os.walk(source):
 for name in files:
  if name.endswith('.gltf'):
   path=os.path.join(folder,name)
   d=json.load(open(path))
   for im in d.get('images',[]):
    uri=im.get('uri','')
    if uri.endswith('_png.png') and not os.path.exists(os.path.join(folder,uri)):
     alternate=uri.replace('_png.png','.png')
     if os.path.exists(os.path.join(folder,alternate)): im['uri']=alternate
   with open(path,'w') as f:json.dump(d,f)
bpy.ops.import_scene.gltf(filepath=os.path.join(base,'Superhero_Male_FullBody.gltf'))
arm=bpy.data.objects['Armature'];body=bpy.data.objects['SuperHero_Male']
# Remove the importer's joint display object; it is not a player mesh.
for o in list(bpy.context.scene.objects):
 if o.type=='MESH' and o.name not in ['SuperHero_Male','Eyes','Eyebrows']:bpy.data.objects.remove(o,do_unlink=True)
def mat(name,color,roughness=.8):
 m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=roughness;return m
skin=body.data.materials[0];skin.name='Skin';shirt=mat('Jersey',(.85,.88,.9));shorts=mat('Shorts',(.025,.04,.075));socks=mat('Socks',(.9,.9,.9));boots=mat('Boots',(.025,.027,.03),.5)
for m in [shirt,shorts,socks,boots]:body.data.materials.append(m)
# Add clean garment boundaries instead of changing materials across uncut triangles.
bm=bmesh.new();bm.from_mesh(body.data)
for height in [.14,.45,.64,1.015,1.49,1.56]:
 bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),plane_co=(0,0,height),plane_no=(0,0,1),dist=.00001)
for width in [-.365,-.105,.105,.365]:
 bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),plane_co=(width,0,0),plane_no=(1,0,0),dist=.00001)
bm.to_mesh(body.data);bm.free();body.data.update()
# Turn the base mesh into an opaque football uniform. Keep its original skin weights.
# Regions follow the reference T-pose. Small expansions give the cloth more volume.
for face in body.data.polygons:
 c=sum((body.data.vertices[i].co for i in face.vertices),Vector())/len(face.vertices);x,y,z=c;ax=abs(x)
 if z<.14:face.material_index=4
 elif z<.45:face.material_index=3
 elif z<1.015:face.material_index=2 if z>.64 else 0
 elif ax<.365 and (z<1.49 or z<1.56 and ax>.105):face.material_index=1
 else:face.material_index=0
# Smooth the muscle contours below the kit, while retaining the neck and limb openings.
cloth={i for f in body.data.polygons if f.material_index in [1,2] for i in f.vertices}
for v in body.data.vertices:
 if v.index in cloth:
  n=v.normal;v.co+=n*.018
  if v.co.z>1.04 and abs(v.co.x)<.22:v.co.y*=1.07
for p in body.data.polygons:p.use_smooth=True
# A simple planar shirt map gives team stripes in the same direction on front and back.
uv=body.data.uv_layers.new(name='FootballKit')
for f in body.data.polygons:
 for li in f.loop_indices:
  v=body.data.vertices[body.data.loops[li].vertex_index].co
  uv.data[li].uv=((v.x+.32)/.64,(v.z-.96)/.62)
# Only the jersey uses the new UV map. Other materials retain the source skin UVs.
shirt.use_nodes=True;uvnode=shirt.node_tree.nodes.new('ShaderNodeUVMap');uvnode.uv_map='FootballKit'
# Export all geometry with UV0 kept for skin and UV1 available for the game jersey.
hairpath=os.path.join(source,'Hairstyles','Origin at 0','glTF (Godot)','Hair_Buzzed.gltf')
before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=hairpath)
for o in set(bpy.data.objects)-before:
 if o.type=='MESH':
  o.name='Hair';o.parent=arm
  # Static hair in the reference pose is weighted to the head for runtime animation.
  group=o.vertex_groups.new(name='Head');group.add(list(range(len(o.data.vertices))),1,'REPLACE')
  mod=o.modifiers.new('Player skeleton','ARMATURE');mod.object=arm
  for m in o.data.materials:m.name='Hair'
# Give skin its source UV layer, and the kit an explicit UV1 reference in the GLB.
img=bpy.data.images.new('Jersey-white',width=8,height=8);img.generated_color=(1,1,1,1)
tex=shirt.node_tree.nodes.new('ShaderNodeTexImage');tex.image=img;shirt.node_tree.links.new(uvnode.outputs['UV'],tex.inputs['Vector']);shirt.node_tree.links.new(tex.outputs['Color'],shirt.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
# Use bounded texture sizes for 22 simultaneous players in a browser.
for image in bpy.data.images:
 if image.size[0]>1024 or image.size[1]>1024:
  scale=1024/max(image.size);image.scale(round(image.size[0]*scale),round(image.size[1]*scale))
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=out,export_format='GLB',export_animations=False,export_texcoords=True,export_yup=True,export_extras=False)
print('Prepared',out)
