import bpy
import numpy as np

RAIZ = "C:/boate/blender/entrada"
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

medias = {}
def imagem(nome, arr, espaco, caminho):
    velha = bpy.data.images.get(nome)
    if velha:
        bpy.data.images.remove(velha)
    img = bpy.data.images.new(nome, W, H, alpha=False)
    img.colorspace_settings.name = espaco
    rgba = np.ones((H, W, 4), np.float32)
    rgba[..., :3] = np.clip(arr, 0, 1)
    img.pixels.foreach_set(rgba.ravel())
    img.update()
    img.filepath_raw = caminho
    img.file_format = 'JPEG'
    img.save(quality=92)
    img.source = 'FILE'
    img.filepath = caminho
    img.reload()
    lido = np.empty(W * H * 4, np.float32)
    img.pixels.foreach_get(lido)
    medias[nome] = [round(float(x), 3) for x in lido.reshape(-1, 4)[:, :3].mean(0)]
    return img

img_cor = imagem("ENT_tijolo_cor", albedo, "sRGB", RAIZ + "/tex/ent_tijolo_cor.jpg")
img_nor = imagem("ENT_tijolo_normal", normal, "Non-Color", RAIZ + "/tex/ent_tijolo_normal.jpg")

nt = bpy.data.materials["ENT_tijolo"].node_tree
texs = sorted((n_ for n_ in nt.nodes if n_.type == 'TEX_IMAGE'), key=lambda n_: n_.location.x)
texs[0].image = img_nor
texs[1].image = img_cor
bpy.ops.file.make_paths_relative()
bpy.ops.wm.save_mainfile()
result = {"medias": medias, "caminhos": [img_cor.filepath, img_nor.filepath]}
