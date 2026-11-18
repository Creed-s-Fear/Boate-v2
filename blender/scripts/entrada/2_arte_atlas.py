import bpy, math, json, bmesh

RAIZ = "C:/boate/blender/entrada"
S = 0.001                      # unidade do Blender por pixel do atlas
AW, AH = 2048, 1024
# nome: x, y, largura, altura (pixels, y de baixo para cima), largura e altura em metros, girado 90 graus
RECTS = {
    "poster":   (8, 376, 1480, 640, 0.93, 2.15, True),
    "interno":  (8, 8, 540, 360, 0.60, 0.90, True),
    "logo":     (556, 8, 360, 360, 0.60, 0.60, False),
    "amarelo":  (924, 156, 300, 212, 0.24, 0.17, False),
    "letreiro": (924, 8, 300, 100, 0.42, 0.14, False),
    "circulo":  (1232, 112, 256, 256, 0.28, 0.28, False),
    "tela":     (1232, 8, 128, 96, 0.30, 0.225, False),
    "regras":   (1496, 476, 420, 540, 0.70, 0.90, False),
    "armas":    (1496, 138, 420, 330, 0.70, 0.55, False),
}

def lin(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)

sc = bpy.data.scenes.get("ENT_ARTE") or bpy.data.scenes.new("ENT_ARTE")
for o in list(sc.collection.objects):
    bpy.data.objects.remove(o)
for m in [m for m in bpy.data.materials if m.name.startswith("ARTE_")]:
    bpy.data.materials.remove(m)

def em(cor):
    nome = "ARTE_" + cor[1:]
    m = bpy.data.materials.get(nome)
    if m:
        return m
    m = bpy.data.materials.new(nome)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    saida = nt.nodes.new('ShaderNodeOutputMaterial')
    e = nt.nodes.new('ShaderNodeEmission')
    e.inputs[0].default_value = (*lin(cor), 1)
    nt.links.new(e.outputs[0], saida.inputs[0])
    return m

def degrade(nome, paradas, riscas):
    m = bpy.data.materials.new("ARTE_" + nome)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    saida = nt.nodes.new('ShaderNodeOutputMaterial')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Generated'], sep.inputs[0])
    rampa = nt.nodes.new('ShaderNodeValToRGB')
    el = rampa.color_ramp.elements
    while len(el) < len(paradas):
        el.new(0.5)
    for e_, (pos, cor) in zip(el, paradas):
        e_.position = pos
        e_.color = (*lin(cor), 1)
    nt.links.new(sep.outputs[1], rampa.inputs[0])
    base = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(rampa.outputs[0], base.inputs[0])
    atual = base.outputs[0]
    for i, (cor, escala, lo, hi, forca) in enumerate(riscas):
        mp = nt.nodes.new('ShaderNodeMapping')
        mp.inputs['Location'].default_value = (7.3 * (i + 1), 3.1 * i, 0)
        mp.inputs['Scale'].default_value = (escala, 0.7, 1)
        nt.links.new(tc.outputs['Generated'], mp.inputs[0])
        nz = nt.nodes.new('ShaderNodeTexNoise')
        nz.inputs['Scale'].default_value = 1.0
        nz.inputs['Detail'].default_value = 2.0
        nt.links.new(mp.outputs[0], nz.inputs['Vector'])
        r2 = nt.nodes.new('ShaderNodeValToRGB')
        r2.color_ramp.elements[0].position = lo
        r2.color_ramp.elements[0].color = (0, 0, 0, 1)
        r2.color_ramp.elements[1].position = hi
        r2.color_ramp.elements[1].color = (forca, forca, forca, 1)
        nt.links.new(nz.outputs[0], r2.inputs[0])
        e2 = nt.nodes.new('ShaderNodeEmission')
        e2.inputs[0].default_value = (*lin(cor), 1)
        nt.links.new(r2.outputs[0], e2.inputs[1])
        soma = nt.nodes.new('ShaderNodeAddShader')
        nt.links.new(atual, soma.inputs[0])
        nt.links.new(e2.outputs[0], soma.inputs[1])
        atual = soma.outputs[0]
    nt.links.new(atual, saida.inputs[0])
    return m

def em_imagem(caminho):
    img = bpy.data.images.load(caminho)
    m = bpy.data.materials.new("ARTE_joh_logo")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    saida = nt.nodes.new('ShaderNodeOutputMaterial')
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    tex.interpolation = 'Smart'
    emissao = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(tex.outputs['Color'], emissao.inputs['Color'])
    if img.channels == 4:
        mix = nt.nodes.new('ShaderNodeMixShader')
        transp = nt.nodes.new('ShaderNodeBsdfTransparent')
        nt.links.new(tex.outputs['Alpha'], mix.inputs['Fac'])
        nt.links.new(transp.outputs[0], mix.inputs[1])
        nt.links.new(emissao.outputs[0], mix.inputs[2])
        nt.links.new(mix.outputs[0], saida.inputs[0])
        if hasattr(m, 'surface_render_method'):
            m.surface_render_method = 'DITHERED'
        elif hasattr(m, 'blend_method'):
            m.blend_method = 'BLEND'
    else:
        nt.links.new(emissao.outputs[0], saida.inputs[0])
    return m, img

larguras = {}

class Arte:
    def __init__(self, nome):
        x, y, w, h, lm, am, gira = RECTS[nome]
        self.nome, self.lm, self.am, self.z = nome, lm, am, 0.0
        k = (w / am if gira else w / lm) * S
        self.e = bpy.data.objects.new("ARTE_" + nome, None)
        sc.collection.objects.link(self.e)
        self.e.location = ((x + w / 2) * S, (y + h / 2) * S, 0)
        self.e.scale = (k, k, 1)
        self.e.rotation_euler = (0, 0, math.pi / 2 if gira else 0)

    def _obj(self, me, x=0.0, y=0.0):
        self.z += 0.002
        o = bpy.data.objects.new(me.name, me)
        o.parent = self.e
        o.location = (x, y, self.z)
        sc.collection.objects.link(o)
        return o

    def poli(self, pts, mat):
        me = bpy.data.meshes.new("ARTE_" + self.nome)
        me.from_pydata([(px, py, 0) for px, py in pts], [], [list(range(len(pts)))])
        me.materials.append(em(mat) if isinstance(mat, str) else mat)
        return self._obj(me)

    def ret(self, cx, cy, w, h, mat):
        return self.poli([(cx - w / 2, cy - h / 2), (cx + w / 2, cy - h / 2), (cx + w / 2, cy + h / 2), (cx - w / 2, cy + h / 2)], mat)

    def fundo(self, mat, sangra=0.006):
        return self.ret(0, 0, self.lm + 2 * sangra, self.am + 2 * sangra, mat)

    def moldura(self, margem, esp, cor, fundo):
        self.ret(0, 0, self.lm - 2 * margem, self.am - 2 * margem, cor)
        self.ret(0, 0, self.lm - 2 * margem - 2 * esp, self.am - 2 * margem - 2 * esp, fundo)

    def disco(self, cx, cy, r, mat, seg=72):
        return self.poli([(cx + r * math.cos(2 * math.pi * i / seg), cy + r * math.sin(2 * math.pi * i / seg)) for i in range(seg)], mat)

    def texto(self, s, cx, cy, tam, cor, larg=None, peso=0.0, esp=1.0):
        cu = bpy.data.curves.new("tmp", 'FONT')
        cu.body = s
        cu.size = tam
        cu.offset = peso * tam
        cu.space_character = esp
        tmp = bpy.data.objects.new("tmp", cu)
        me = bpy.data.meshes.new_from_object(tmp)
        bpy.data.objects.remove(tmp)
        bpy.data.curves.remove(cu)
        me.name = "ARTE_txt"
        xs = [v.co.x for v in me.vertices]
        w = (max(xs) - min(xs)) if xs else 0.0
        larguras[self.nome + ":" + s] = round(w, 3)
        k = min(1.0, larg / w) if (larg and w > 0) else 1.0
        ox = (max(xs) + min(xs)) / 2 if xs else 0.0
        for v in me.vertices:
            v.co.x = (v.co.x - ox) * k
            v.co.y = (v.co.y - 0.365 * tam) * k
        me.materials.clear()
        me.materials.append(em(cor))
        return self._obj(me, cx, cy)

    def lotus(self, cx, cy, t, cores=("#b0124f", "#e91e63", "#ff6aa9")):
        for ang, comp, cor in ((68, 0.72, cores[0]), (-68, 0.72, cores[0]), (36, 0.88, cores[1]), (-36, 0.88, cores[1]), (0, 1.0, cores[2])):
            n = 10
            lado = [(0.2 * math.sin(math.pi * (i / n) ** 0.8), i / n * comp) for i in range(n + 1)]
            pts = [(-hw, y) for hw, y in lado] + [(hw, y) for hw, y in lado[-2:0:-1]]
            a = math.radians(ang)
            self.poli([(cx + t * (px * math.cos(a) - py * math.sin(a)), cy + t * (px * math.sin(a) + py * math.cos(a))) for px, py in pts], cor)

    def coracao(self, cx, cy, r, cor):
        self.disco(cx - 0.48 * r, cy + 0.3 * r, 0.55 * r, cor, 24)
        self.disco(cx + 0.48 * r, cy + 0.3 * r, 0.55 * r, cor, 24)
        self.poli([(cx - 0.98 * r, cy + 0.08 * r), (cx, cy - r), (cx + 0.98 * r, cy + 0.08 * r)], cor)

    def coracao_oco(self, cx, cy, r, cor, fundo="#0c0c14", esp=0.18):
        self.coracao(cx, cy, r, cor)
        ri = r * (1 - esp)
        dy = (r - ri) * 0.15
        self.disco(cx - 0.48 * ri, cy + 0.3 * ri + dy, 0.55 * ri, fundo, 24)
        self.disco(cx + 0.48 * ri, cy + 0.3 * ri + dy, 0.55 * ri, fundo, 24)
        self.poli([(cx - 0.98 * ri, cy + 0.08 * ri + dy), (cx, cy - ri + dy), (cx + 0.98 * ri, cy + 0.08 * ri + dy)], fundo)

    def anel(self, cx, cy, r_ext, r_int, cor, fundo="#0c0c14", seg=72):
        self.disco(cx, cy, r_ext, cor, seg)
        self.disco(cx, cy, r_int, fundo, seg)

    def losango(self, cx, cy, w, h, cor):
        self.poli([(cx, cy + h / 2), (cx + w / 2, cy), (cx, cy - h / 2), (cx - w / 2, cy)], cor)

    def linha_h(self, cx, cy, comp, esp, cor):
        self.ret(cx, cy, comp, esp, cor)

    def plano_img(self, cx, cy, w, h, mat):
        bm = bmesh.new()
        v0 = bm.verts.new((cx - w / 2, cy - h / 2, 0))
        v1 = bm.verts.new((cx + w / 2, cy - h / 2, 0))
        v2 = bm.verts.new((cx + w / 2, cy + h / 2, 0))
        v3 = bm.verts.new((cx - w / 2, cy + h / 2, 0))
        face = bm.faces.new([v0, v1, v2, v3])
        uv_layer = bm.loops.layers.uv.new()
        for loop, uv in zip(face.loops, [(0, 0), (1, 0), (1, 1), (0, 1)]):
            loop[uv_layer].uv = uv
        me = bpy.data.meshes.new("ARTE_img_" + self.nome)
        bm.to_mesh(me)
        bm.free()
        me.materials.append(mat)
        return self._obj(me)

MENTA, PRETO, LAV, CREME, OURO = "#8fe6b8", "#060608", "#d6cdf0", "#fff2d0", "#ffd24a"
ROSA, ROSA_C = "#e91e63", "#ff4081"
mat_logo, logo_img = em_imagem(RAIZ + "/tex/joh_logo.webp")
logo_asp = logo_img.size[0] / logo_img.size[1] if logo_img.size[1] > 0 else 1.21

# cartaz da porta
p = Arte("poster")
p.fundo(degrade("poster", [(0.0, "#170a3c"), (0.4, "#3b1486"), (0.75, "#5a1cae"), (1.0, "#22208c")],
                [("#ff3fb0", 34, 0.5, 0.78, 0.55), ("#2a6cff", 22, 0.52, 0.8, 0.5)]))
# emblema central: anéis decorativos
p.disco(0, 0.02, 0.39, OURO)
p.disco(0, 0.02, 0.385, PRETO)
p.disco(0, 0.02, 0.37, "#0c0c14")
p.anel(0, 0.02, 0.35, 0.344, OURO)
p.anel(0, 0.02, 0.335, 0.33, MENTA)
# logo PNG (imagem fornecida pelo Pedro)
lw = 0.56
lh = lw / logo_asp
p.plano_img(0, 0.02, lw, lh, mat_logo)
# redes sociais
p.disco(0, -0.55, 0.047, LAV)
p.disco(0, -0.55, 0.038, "#2a1466")
p.coracao(0, -0.553, 0.02, LAV)
p.texto("JACKOFHEARTS", 0, -0.64, 0.036, LAV, esp=1.15)
p.disco(0, -0.78, 0.047, LAV)
p.disco(0, -0.78, 0.038, "#2a1466")
p.coracao(0, -0.783, 0.02, LAV)
p.texto("JACKOFHEARTS", 0, -0.87, 0.036, LAV, esp=1.15)
# rodapé
p.linha_h(0, -0.935, 0.6, 0.003, LAV)
p.texto("LOUNGE · BAR · SUITE", 0, -0.97, 0.028, LAV, esp=1.3)

# cartaz interno
c = Arte("interno")
fundo_int = degrade("interno", [(0.0, "#3a0618"), (0.55, "#a80f4e"), (1.0, "#ff2d8a")], [("#ff9a3c", 18, 0.55, 0.85, 0.35)])
c.fundo(fundo_int)
c.ret(0, 0, 0.54, 0.84, CREME)
c.ret(0, 0, 0.53, 0.83, fundo_int)
c.texto("TONIGHT", 0, 0.30, 0.13, CREME, larg=0.46, peso=0.02)
c.texto("LIVE DJ", 0, 0.185, 0.062, OURO, larg=0.46, peso=0.015)
c.lotus(0, -0.10, 0.2, cores=("#ffb300", OURO, CREME))
c.texto("MAIN FLOOR", 0, -0.175, 0.034, CREME, larg=0.46, esp=1.2)
c.texto("11 PM", 0, -0.275, 0.1, OURO, peso=0.02)
c.texto("JACK OF HEARTS", 0, -0.375, 0.026, CREME, esp=1.4)

# placa com o logo
g = Arte("logo")
g.fundo("#101112")
g.disco(0, 0, 0.275, OURO)
g.disco(0, 0, 0.27, "#101112")
g.disco(0, 0, 0.265, MENTA)
g.disco(0, 0, 0.258, "#101112")
g.anel(0, 0, 0.245, 0.24, OURO, "#101112")
# logo PNG
gw = 0.38
gh = gw / logo_asp
g.plano_img(0, 0.01, gw, gh, mat_logo)

# placas de aviso
TXT = "#d5ecd9"
r = Arte("regras")
r.fundo("#141516")
r.moldura(0.03, 0.006, TXT, "#141516")
for i, linha in enumerate(("HARASSMENT OF", "DANCERS OR", "STAFF WILL NOT", "BE TOLERATED")):
    r.texto(linha, 0, 0.33 - 0.078 * i, 0.052, TXT, larg=0.58, peso=0.012)
r.ret(0, 0.035, 0.3, 0.005, TXT)
for i, linha in enumerate(("MANAGEMENT", "RESERVES THE RIGHT", "TO REFUSE", "ADMISSION")):
    r.texto(linha, 0, -0.035 - 0.078 * i, 0.052, TXT, larg=0.58, peso=0.012)
r.lotus(0, -0.39, 0.06, cores=(TXT, TXT, TXT))

a = Arte("armas")
a.fundo("#141516")
a.moldura(0.03, 0.006, TXT, "#141516")
for i, linha in enumerate(("NO WEAPONS", "OF ANY KIND", "PERMITTED ON")):
    a.texto(linha, 0, 0.15 - 0.09 * i, 0.058, TXT, larg=0.58, peso=0.012)
a.texto("THESE PREMISES", 0, -0.15, 0.03, TXT, larg=0.58, esp=1.2)

# adesivos da porta
y_ = Arte("amarelo")
y_.fundo("#f2d21b")
y_.texto("OVER 21", 0, 0.034, 0.05, PRETO, larg=0.2, peso=0.03)
y_.texto("ONLY", 0, -0.036, 0.055, PRETO, larg=0.2, peso=0.03)

k = Arte("circulo")
k.fundo("#f4f4ef")
k.disco(0, 0, 0.128, "#0f5c2e")
k.texto("ID", 0, 0.035, 0.12, "#ffffff", peso=0.03)
k.texto("CHECK", 0, -0.045, 0.03, "#f2d21b", larg=0.2, peso=0.02)
k.texto("PHOTO ID REQUIRED", 0, -0.083, 0.014, "#ffffff", larg=0.16)

# caixa eletrônico
l = Arte("letreiro")
l.fundo("#ff2d8a")
l.texto("ATM 24H", 0, 0, 0.075, "#ffffff", larg=0.38, peso=0.02)

t = Arte("tela")
t.fundo("#0b2a6b")
t.ret(0, 0.082, 0.3, 0.05, "#1c58d9")
t.texto("JOH", 0, 0.082, 0.034, "#ffffff", peso=0.02)
for bx in (-0.075, 0.075):
    for by in (0.01, -0.05):
        t.ret(bx, by, 0.12, 0.04, "#9cc4ff")

# câmera e render
cam = bpy.data.objects.new("ARTE_camera", bpy.data.cameras.new("ARTE_camera"))
cam.data.type = 'ORTHO'
cam.data.ortho_scale = AW * S
cam.location = (AW * S / 2, AH * S / 2, 5)
sc.collection.objects.link(cam)
sc.camera = cam
mundo = bpy.data.worlds.get("ARTE_fundo") or bpy.data.worlds.new("ARTE_fundo")
mundo.color = (0, 0, 0)
if mundo.node_tree:
    for n_ in mundo.node_tree.nodes:
        if n_.type == 'BACKGROUND':
            n_.inputs[0].default_value = (0, 0, 0, 1)
sc.world = mundo
sc.render.engine = 'BLENDER_EEVEE'
sc.eevee.taa_render_samples = 16
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = AW, AH, 100
sc.view_settings.view_transform = 'Standard'
sc.view_settings.look = 'None'
ims = sc.render.image_settings
if hasattr(ims, "media_type"):
    ims.media_type = 'IMAGE'
ims.file_format = 'PNG'
ims.color_mode = 'RGB'
sc.render.filepath = RAIZ + "/tex/ent_atlas.png"
sc["rects"] = json.dumps(RECTS)
bpy.ops.render.render(write_still=True, scene="ENT_ARTE")
bpy.ops.wm.save_mainfile()
result = {"render": sc.render.filepath, "larguras": larguras, "objetos": len(sc.collection.objects)}
