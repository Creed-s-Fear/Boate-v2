# ETAPA 1 - Biblioteca de pecas (rodar uma vez por .blend novo).
# Enviado ao Blender pelo MCP (execute_blender_code), com aprovacao do Pedro. Copia de referencia.
# Importa cada GLB de C:/boate/assets/drive/Objetos direto para a colecao PECAS (fora da cena final),
# renomeia para LIB_<nome>, unifica materiais repetidos (KIT_x.001 -> KIT_x) e corrige 5 materiais
# que vieram brancos (textura procedural nao exporta para glTF). So le arquivos do projeto.
import bpy
import json

BASE = "C:/boate/assets/drive/Objetos/"
LAYOUT = "C:/boate/blender/layout.json"

with open(LAYOUT, encoding="utf-8") as fh:
    layout = json.load(fh)
paths = layout["paths"]

scene = bpy.context.scene
view_layer = bpy.context.view_layer
lib = bpy.data.collections.get("PECAS")
if lib is None:
    lib = bpy.data.collections.new("PECAS")
    scene.collection.children.link(lib)

# PECAS vira a colecao ativa: o importador cria os objetos dentro dela
lib_layer = view_layer.layer_collection.children.get("PECAS")
lib_layer.exclude = False
view_layer.active_layer_collection = lib_layer

imported = []
failed = []
for name in sorted(paths):
    if bpy.data.objects.get("LIB_" + name) is not None:
        continue
    before = {o.name for o in bpy.data.objects}
    try:
        bpy.ops.import_scene.gltf(
            filepath=BASE + paths[name],
            import_scene_as_collection=False,
            import_select_created_objects=False,
        )
    except Exception as ex:
        failed.append([name, str(ex)[:160]])
        continue
    meshes = [o for o in bpy.data.objects if o.name not in before and o.type == 'MESH']
    if not meshes:
        failed.append([name, "sem malha"])
        continue
    meshes[0].name = "LIB_" + name
    meshes[0].data.name = name
    imported.append(name)

# materiais repetidos: KIT_x.001 passa a usar KIT_x
merged = 0
for mat in list(bpy.data.materials):
    parts = mat.name.rsplit(".", 1)
    if len(parts) == 2 and parts[1].isdigit() and parts[0] in bpy.data.materials:
        mat.user_remap(bpy.data.materials[parts[0]])
        if mat.users == 0:
            bpy.data.materials.remove(mat)
            merged += 1

# materiais que vieram brancos: tons escolhidos pela imagem de referencia (ajustar a gosto)
FIX = {
    "KIT_j_wall": ((0.050, 0.008, 0.022), 0.45),
    "KIT_j_floor": ((0.014, 0.004, 0.009), 0.10),
    "KIT_j_marble": ((0.060, 0.010, 0.026), 0.14),
    "KIT_marble": ((0.012, 0.009, 0.014), 0.10),
    "KIT_floor_wet": ((0.014, 0.011, 0.018), 0.16),
}
for mname, (rgb, rough) in FIX.items():
    mat = bpy.data.materials.get(mname)
    if mat is None or mat.node_tree is None:
        continue
    for node in mat.node_tree.nodes:
        if node.type == 'BSDF_PRINCIPLED':
            node.inputs["Base Color"].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
            node.inputs["Roughness"].default_value = rough

# a biblioteca nao aparece na cena nem no render
view_layer.active_layer_collection = view_layer.layer_collection
lib.hide_render = True
lib_layer.exclude = True

result = {"importadas": len(imported), "falhas": failed, "materiais_unificados": merged}
