# ETAPA 2 - Monta o cenario a partir de C:/boate/blender/layout.json e exporta o GLB bruto.
# Enviado ao Blender pelo MCP (execute_blender_code), com aprovacao do Pedro. Copia de referencia.
# Rodar de novo sempre que o layout.json mudar (npm run planta). Apaga apenas objetos marcados
# "gerado" por este script: ajustes feitos a mao nesses objetos se perdem ao rodar de novo.
# Disco: le layout.json, salva o .blend e grava C:/boate/blender/export/boate_raw.glb.
# Depois, fora do Blender: npm run otimizar (gera public/models/boate.glb).
# Nao passar export_loglevel ao exportador: no Blender 5.2 isso quebra com KeyError 'loglevel'.
import bpy
import bmesh
import json
import math
import os

LAYOUT = "C:/boate/blender/layout.json"
OUT = "C:/boate/blender/export/boate_raw.glb"
with open(LAYOUT, encoding="utf-8") as fh:
    layout = json.load(fh)

scene = bpy.context.scene


def get_coll(name, parent):
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
    if c.name not in parent.children:
        parent.children.link(c)
    return c


def loc(p):  # glTF (x, y, z) -> Blender (x, -z, y)
    return (p[0], -p[2], p[1])


def hex_lin(h):
    h = h.lstrip("#")
    return [(int(h[i:i + 2], 16) / 255.0) ** 2.2 for i in (0, 2, 4)]


# ---- limpa a montagem anterior (so o que este script gerou) ----
old = [o for o in bpy.data.objects if o.get("gerado")]
old_meshes = {o.data for o in old if o.type == 'MESH' and (o.data.name.startswith("FILL_") or "_vao" in o.data.name or "_recorte" in o.data.name)}
old_lights = {o.data for o in old if o.type == 'LIGHT'}
for o in old:
    bpy.data.objects.remove(o, do_unlink=True)
for me in old_meshes:
    if me.users == 0:
        bpy.data.meshes.remove(me)
for ld in old_lights:
    if ld.users == 0:
        bpy.data.lights.remove(ld)

root = get_coll("CENARIO", scene.collection)


def empty(name, col, location=(0, 0, 0), rot_z=0.0, size=0.5, parent=None):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = 'PLAIN_AXES'
    e.empty_display_size = size
    e.location = location
    e.rotation_euler = (0.0, 0.0, rot_z)
    e["gerado"] = 1
    e.parent = parent
    col.objects.link(e)
    return e


def box_mesh(name, dx, dy, dz):
    hx, hy, hz = dx / 2, dy / 2, dz / 2
    v = [(-hx, -hy, -hz), (hx, -hy, -hz), (hx, hy, -hz), (-hx, hy, -hz),
         (-hx, -hy, hz), (hx, -hy, hz), (hx, hy, hz), (-hx, hy, hz)]
    f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    me = bpy.data.meshes.new(name)
    me.from_pydata(v, [], f)
    me.update()
    return me


def door_cutter(cx):
    # solido com a silhueta da porta JAC_38 (casco convexo), atravessando a parede
    door_me = bpy.data.objects["LIB_JAC_38_Porta"].data
    bm = bmesh.new()
    for v in door_me.vertices:
        z = v.co.z if v.co.z > 0.02 else -0.06
        bm.verts.new((v.co.x * 1.004 + cx, v.co.y * 9.0, z))
    res = bmesh.ops.convex_hull(bm, input=list(bm.verts))
    inner = [g for g in res["geom_interior"] if isinstance(g, bmesh.types.BMVert)]
    if inner:
        bmesh.ops.delete(bm, geom=inner, context='VERTS')
    loose = [v for v in bm.verts if not v.link_faces]
    if loose:
        bmesh.ops.delete(bm, geom=loose, context='VERTS')
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    me = bpy.data.meshes.new("CORTE_porta")
    bm.to_mesh(me)
    bm.free()
    return me


def cut_door(me_src, cut):
    # Vao da porta: so nas cascas FECHADAS da parede que cruzam a porta (nucleo, rodape, marmore).
    # A porta falsa embutida e removida; o resto da parede fica intacto. (Booleano na parede
    # inteira falha: as partes abertas, como as trelicas, confundem o dentro/fora.)
    x0, x1 = cut["x"]
    top = cut["y"][1]
    m = 0.03
    bm = bmesh.new()
    bm.from_mesh(me_src)
    bm.faces.ensure_lookup_table()
    bm.faces.index_update()

    parent = {}

    def key(co):
        return (round(co.x, 4), round(co.y, 4), round(co.z, 4))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for f in bm.faces:
        ks = [key(v.co) for v in f.verts]
        for k in ks:
            parent.setdefault(k, k)
        r = find(ks[0])
        for k in ks[1:]:
            parent[find(k)] = r
    shells = {}
    for f in bm.faces:
        shells.setdefault(find(key(f.verts[0].co)), []).append(f)

    drop_idx = set()
    cut_idx = set()
    for faces in shells.values():
        xs = [v.co.x for f in faces for v in f.verts]
        zs = [v.co.z for f in faces for v in f.verts]
        bx0, bx1, bz0, bz1 = min(xs), max(xs), min(zs), max(zs)
        if bx0 >= x0 - m and bx1 <= x1 + m and bz1 <= top + m:
            drop_idx.update(f.index for f in faces)  # porta falsa embutida
        elif bx1 > x0 + m and bx0 < x1 - m and bz0 < top - m:
            cut_idx.update(f.index for f in faces)  # peca atravessada pelo vao

    bm_b = bm.copy()
    bm_b.faces.ensure_lookup_table()
    bmesh.ops.delete(bm_b, geom=[f for f in bm_b.faces if f.index in drop_idx or f.index in cut_idx], context='FACES')
    me_b = bpy.data.meshes.new(me_src.name + "_vao")
    bm_b.to_mesh(me_b)
    bm_b.free()

    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in cut_idx], context='FACES')
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.0002)
    me_a = bpy.data.meshes.new("TMP_recorte")
    bm.to_mesh(me_a)
    bm.free()
    for mat in me_src.materials:
        me_a.materials.append(mat)

    cut_me = door_cutter((x0 + x1) / 2)
    cutter = bpy.data.objects.new("CORTE_porta", cut_me)
    tmp = bpy.data.objects.new("TMP_recorte", me_a)
    scene.collection.objects.link(cutter)
    scene.collection.objects.link(tmp)
    mod = tmp.modifiers.new("vao", 'BOOLEAN')
    mod.operation = 'DIFFERENCE'
    mod.solver = 'EXACT'
    mod.use_self = True
    mod.object = cutter
    dg = bpy.context.evaluated_depsgraph_get()
    dg.update()
    me_c = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    me_c.name = me_src.name + "_recorte"
    for p in me_c.polygons:
        p.use_smooth = False
    bpy.data.objects.remove(tmp, do_unlink=True)
    bpy.data.objects.remove(cutter, do_unlink=True)
    bpy.data.meshes.remove(me_a)
    bpy.data.meshes.remove(cut_me)
    return me_b, me_c


missing = []
counts = {}
for rname, room in layout["rooms"].items():
    shared = rname == "shared"
    col = get_coll("COMUM" if shared else "ROOM_" + rname, root)
    parent = None
    if not shared:
        parent = empty("ROOM_" + rname, col, size=1.0)
        parent["label"] = room["label"]

    for it in room["items"]:
        src = bpy.data.objects.get("LIB_" + it["a"])
        if src is None:
            missing.append(it["a"])
            continue
        meshes = [src.data]
        names = [it.get("n") or it["a"]]
        if "cut" in it:
            me_b, me_c = cut_door(src.data, it["cut"])
            meshes = [me_b, me_c]
            names = [names[0], names[0] + "_recorte"]
        for me, name in zip(meshes, names):
            ob = bpy.data.objects.new(name, me)
            ob.location = loc(it["p"])
            ob.rotation_euler = (math.radians(it.get("rx", 0.0)), 0.0, math.radians(it["r"]))
            if "s" in it:
                ob.scale = (it["s"][0], it["s"][2], it["s"][1])
            ob.parent = parent
            ob["gerado"] = 1
            col.objects.link(ob)

    for fl in room["fills"]:
        sx, sy, sz = fl["size"]
        me = box_mesh("FILL_" + fl["n"], sx, sz, sy)
        mat = bpy.data.materials.get(fl["m"])
        if mat is not None:
            me.materials.append(mat)
        ob = bpy.data.objects.new("FILL_" + fl["n"], me)
        ob.location = loc(fl["p"])
        ob.parent = parent
        ob["gerado"] = 1
        if fl.get("collide"):
            ob["collide"] = 1
        col.objects.link(ob)

    for i, lt in enumerate(room["lights"]):
        ld = bpy.data.lights.new("LUZ_" + rname + "_" + str(i), 'POINT')
        ld.color = hex_lin(lt["c"])
        ld.energy = lt["i"] * 10.0
        ld.shadow_soft_size = 0.15
        ob = bpy.data.objects.new(ld.name, ld)
        ob.location = loc(lt["p"])
        ob.parent = parent
        ob["gerado"] = 1
        ob["cd"] = lt["i"]  # intensidade usada pelo jogo (candela)
        ob["dist"] = lt["d"]
        col.objects.link(ob)

    counts[rname] = [len(room["items"]), len(room["fills"]), len(room["lights"])]

# ---- porta com dobradica e ponto inicial ----
comum = get_coll("COMUM", root)
for d in layout["doors"]:
    piv = empty("DOOR_" + d["n"], comum, loc(d["pivot"]), math.radians(d["r"]), 0.4)
    piv["door"] = d["type"]
    piv["angle"] = d["angle"]
    piv["rooms"] = d["rooms"]
    leaf = bpy.data.objects.new(d["a"], bpy.data.objects["LIB_" + d["a"]].data)
    off = d["offset"]
    leaf.location = (off[0], -off[2], off[1])
    leaf.parent = piv
    leaf["gerado"] = 1
    comum.objects.link(leaf)

sp = empty("SPAWN", comum, loc(layout["spawn"]["p"]), 0.0, 0.6)
sp.empty_display_type = 'SINGLE_ARROW'
sp["yaw"] = layout["spawn"]["yaw"]

bpy.context.view_layer.update()
bpy.ops.wm.save_mainfile()

import logging  # o exportador escreve centenas de linhas INFO: silencia so durante a exportacao

logging.disable(logging.INFO)
try:
    bpy.ops.export_scene.gltf(
        filepath=OUT,
        check_existing=False,
        export_format='GLB',
        collection="CENARIO",
        export_extras=True,
        export_lights=True,
        export_cameras=False,
        export_animations=False,
        export_skins=False,
        export_morph=False,
        export_texcoords=False,
        export_vertex_color='NONE',
        export_all_vertex_colors=False,
        export_active_vertex_color_when_no_material=False,
        export_apply=False,
        export_yup=True,
    )
finally:
    logging.disable(logging.NOTSET)

result = {
    "objetos_gerados": len([o for o in bpy.data.objects if o.get("gerado")]),
    "por_sala": counts,
    "faltando": sorted(set(missing)),
    "glb_mb": round(os.path.getsize(OUT) / 1048576, 2),
}
