import bpy, os, logging, math
from mathutils import Vector

RAIZ = "C:/boate/blender/entrada"
SAIDA = "C:/boate/assets/Entrada"
os.makedirs(SAIDA, exist_ok=True)
os.makedirs("C:/boate/blender/export", exist_ok=True)
cena = bpy.data.scenes["ENTRADA"]
PECAS = bpy.data.collections["PECAS_ENTRADA"]
MONT = bpy.data.collections["MONTAGEM"]
PREV = bpy.data.collections["PREVIA"]
camada = cena.view_layers[0]

def so(objs):
    for o in camada.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    camada.objects.active = objs[0]

def exportar(caminho):
    logging.disable(logging.INFO)
    try:
        bpy.ops.export_scene.gltf(filepath=caminho, export_format='GLB', use_selection=True, export_yup=True,
                                  export_image_format='JPEG', export_jpeg_quality=90,
                                  export_cameras=False, export_lights=False, export_animations=False, export_extras=False)
    finally:
        logging.disable(logging.NOTSET)
    return round(os.path.getsize(caminho) / 1024)

tamanhos = {}
pecas = sorted(PECAS.objects, key=lambda o: o.location.x)
for o in pecas:
    guardado = o.location.copy()
    o.location = (0, 0, 0)
    so([o])
    tamanhos[o.name] = exportar(SAIDA + "/" + o.name + ".glb")
    o.location = guardado
so(list(MONT.objects))
tamanhos["entrada_montagem"] = exportar("C:/boate/blender/export/entrada_montagem.glb")
for o in camada.objects:
    o.select_set(False)

# prateleira vai para trás da montagem e ganha duas câmeras próprias
for o in pecas:
    o.location.y = 20.0
for nome in ("PREV_cam_prateleira", "PREV_cam_prateleira_1", "PREV_cam_prateleira_2"):
    velha = bpy.data.objects.get(nome)
    if velha:
        bpy.data.objects.remove(velha)
larg = max(o.location.x for o in pecas) + 1.5
def camera_orto(nome, x, escala):
    d = bpy.data.cameras.new(nome)
    d.type, d.ortho_scale = 'ORTHO', escala
    c = bpy.data.objects.new(nome, d)
    c.location = (x, 8, 4)
    c.rotation_euler = (Vector((x, 20, 1.4)) - Vector(c.location)).to_track_quat('-Z', 'Y').to_euler()
    PREV.objects.link(c)
    return c
cam1 = camera_orto("PREV_cam_prateleira_1", 7.6, 16.5)
cam2 = camera_orto("PREV_cam_prateleira_2", 23.4, 17.5)

mundo = bpy.data.worlds["ENT_previa"]
def fundo(cor):
    mundo.color = cor
    if mundo.node_tree:
        for n in mundo.node_tree.nodes:
            if n.type == 'BACKGROUND':
                n.inputs[0].default_value = (*cor, 1)
sol = bpy.data.objects["PREV_sol"]
def tirar(nome, cam, w, h):
    cena.camera = cam
    cena.render.resolution_x, cena.render.resolution_y = w, h
    cena.render.filepath = RAIZ + "/previa/" + nome + ".png"
    bpy.ops.render.render(write_still=True, scene="ENTRADA")
sol.hide_render = False
fundo((0.35, 0.37, 0.4))
tirar("fachada_dia", bpy.data.objects["PREV_cam_frente"], 1600, 640)
tirar("prateleira_1", cam1, 2000, 640)
tirar("prateleira_2", cam2, 2000, 640)
sol.hide_render = True
fundo((0.004, 0.005, 0.012))
cena.camera = bpy.data.objects["PREV_cam_fachada"]
bpy.ops.wm.save_mainfile()
result = {"kb": tamanhos, "total_kb": sum(v for k, v in tamanhos.items() if k != "entrada_montagem"), "prateleira_m": round(larg, 1)}
