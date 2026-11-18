import bpy, os
import numpy as np

RAIZ = "C:/boate/blender/entrada"
os.makedirs(RAIZ + "/tex", exist_ok=True)

# Arquivo novo: tira só os três objetos padrão e cria as coleções do kit.
if bpy.data.filepath == "":
    for nome in ("Cube", "Camera", "Light"):
        o = bpy.data.objects.get(nome)
        if o:
            bpy.data.objects.remove(o)
    padrao = bpy.data.collections.get("Collection")
    if padrao and not padrao.objects:
        bpy.data.collections.remove(padrao)
cena = bpy.context.scene
cena.name = "ENTRADA"
for nome in ("PECAS_ENTRADA", "MONTAGEM", "PREVIA"):
    if nome not in bpy.data.collections:
        cena.collection.children.link(bpy.data.collections.new(nome))

# ---------- textura de tijolo (10 tijolos x 16 fiadas = 2,4 m x 1,2 m, repete sem emenda) ----------
W = H = 1024
NX, NY = 10, 16
rng = np.random.default_rng(11)

def ruido(n):
    g = rng.random((n, n))
    def eixo(N):
        p = np.arange(N) / N * n
        i = np.floor(p).astype(int)
        t = p - i
        return i % n, (i + 1) % n, t * t * (3 - 2 * t)
    x0, x1, tx = eixo(W)
    y0, y1, ty = eixo(H)
    tx = tx[None, :]
    ty = ty[:, None]
    a, b = g[np.ix_(y0, x0)], g[np.ix_(y0, x1)]
    c, d = g[np.ix_(y1, x0)], g[np.ix_(y1, x1)]
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty

def fbm(ns):
    return sum(ruido(n) / (i + 1) for i, n in enumerate(ns)) / sum(1 / (i + 1) for i in range(len(ns)))

yy, xx = np.mgrid[0:H, 0:W]
v = yy / H * NY
fila = np.floor(v).astype(int)
fv = v - fila
u = xx / W * NX + 0.5 * (fila % 2)
col = np.floor(u).astype(int) % NX
fu = u - np.floor(u)
dist = np.minimum(np.minimum(fu, 1 - fu) * 0.24, np.minimum(fv, 1 - fv) * 0.075)
g1 = fbm([8, 16, 32, 64])
g2 = fbm([128, 256])
borda = 0.005 + (fbm([64, 128]) - 0.5) * 0.004
tij = np.clip((dist - borda) / 0.003, 0, 1)

tom = rng.uniform(0.7, 1.15, (NY, NX))[fila, col]
quente = rng.random((NY, NX))[fila, col]
escuro = (rng.random((NY, NX)) < 0.14)[fila, col]
cor = np.stack([0.33 + 0.07 * quente, 0.17 + 0.02 * quente, 0.13 + 0.01 * quente], -1) * tom[..., None]
cor = np.where(escuro[..., None], cor * 0.55 + 0.02, cor)
cor = cor * (0.75 + 0.5 * g1)[..., None] * (0.85 + 0.3 * g2)[..., None]
rejunte = np.array([0.21, 0.20, 0.19]) * (0.8 + 0.4 * g2)[..., None]
albedo = rejunte * (1 - tij[..., None]) + cor * tij[..., None]

altura = tij * 0.7 + g2 * 0.2 + g1 * 0.1 * tij
dx = np.roll(altura, -1, 1) - np.roll(altura, 1, 1)
dy = np.roll(altura, -1, 0) - np.roll(altura, 1, 0)
n = np.stack([-dx * 1.25, -dy * 2.5, np.ones_like(altura)], -1)
n /= np.linalg.norm(n, axis=-1, keepdims=True)
normal = n * 0.5 + 0.5

def imagem(nome, arr, espaco, caminho):
    img = bpy.data.images.get(nome) or bpy.data.images.new(nome, W, H, alpha=False)
    rgba = np.ones((H, W, 4), np.float32)
    rgba[..., :3] = np.clip(arr, 0, 1)
    img.pixels.foreach_set(rgba.ravel())
    img.colorspace_settings.name = espaco
    img.filepath_raw = caminho
    img.file_format = 'JPEG'
    img.save(quality=92)
    img.source = 'FILE'
    img.reload()
    return img

img_cor = imagem("ENT_tijolo_cor", albedo, "sRGB", RAIZ + "/tex/ent_tijolo_cor.jpg")
img_nor = imagem("ENT_tijolo_normal", normal, "Non-Color", RAIZ + "/tex/ent_tijolo_normal.jpg")

# ---------- materiais ----------
def lin(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)

def material(nome, cor, metal=0.0, rough=0.5, alpha=1.0, emis=None, forca=0.0, dupla=False):
    m = bpy.data.materials.get(nome) or bpy.data.materials.new(nome)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    saida = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    saida.location = (300, 0)
    nt.links.new(bsdf.outputs['BSDF'], saida.inputs['Surface'])
    rgb = lin(cor)
    bsdf.inputs['Base Color'].default_value = (*rgb, 1)
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Alpha'].default_value = alpha
    if emis:
        bsdf.inputs['Emission Color'].default_value = (*lin(emis), 1)
        bsdf.inputs['Emission Strength'].default_value = forca
    m.use_backface_culling = not dupla
    if alpha < 1:
        m.surface_render_method = 'BLENDED'
    m.diffuse_color = (*rgb, alpha)
    m.metallic = metal
    m.roughness = rough
    return m

material("ENT_metal_esquadria", "#2a2c30", metal=0.9, rough=0.38)
material("ENT_cromado", "#c9ccd1", metal=1.0, rough=0.16)
material("ENT_vidro", "#3a4250", metal=0.0, rough=0.05, alpha=0.28, dupla=True)
material("ENT_placa_preta", "#1b1c1e", metal=0.3, rough=0.5)
material("ENT_luz_lente", "#fff4e0", rough=0.3, emis="#fff1d6", forca=8.0)
material("ENT_concreto", "#8b8a86", rough=0.95)
material("ENT_concreto_escuro", "#55544f", rough=0.95)
material("ENT_toldo_vinho", "#6e1626", rough=0.85, dupla=True)
material("ENT_toldo_creme", "#d9cdb4", rough=0.85, dupla=True)
material("ENT_atm_corpo", "#c9c7c9", metal=0.2, rough=0.45)
material("ENT_atm_escuro", "#1d1e22", metal=0.3, rough=0.4)
material("ENT_atm_led", "#22ff88", rough=0.4, emis="#22ff88", forca=4.0)
material("ENT_vaso", "#2b2b2e", rough=0.7)
material("ENT_terra", "#3a2a1e", rough=1.0)
material("ENT_planta", "#2f6b3a", rough=0.6, dupla=True)

tijolo = material("ENT_tijolo", "#6b3a2e", rough=0.9)
nt = tijolo.node_tree
bsdf = next(n_ for n_ in nt.nodes if n_.type == 'BSDF_PRINCIPLED')
tc = nt.nodes.new('ShaderNodeTexImage'); tc.image = img_cor; tc.location = (-500, 200)
tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = img_nor; tn.location = (-700, -200)
nm = nt.nodes.new('ShaderNodeNormalMap'); nm.location = (-300, -200)
nt.links.new(tc.outputs['Color'], bsdf.inputs['Base Color'])
nt.links.new(tn.outputs['Color'], nm.inputs['Color'])
nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])

bpy.ops.wm.save_as_mainfile(filepath="C:/boate/blender/entrada.blend")
result = {
    "arquivo": bpy.data.filepath,
    "colecoes": [c.name for c in cena.collection.children],
    "materiais": sorted(m.name for m in bpy.data.materials if m.name.startswith("ENT_")),
    "imagens": {i.name: [i.size[0], i.size[1], i.filepath] for i in bpy.data.images if i.name.startswith("ENT_")},
}
