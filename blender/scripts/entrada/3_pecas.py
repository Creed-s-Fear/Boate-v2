import bpy, bmesh, math, json
from mathutils import Matrix, Vector

RAIZ = "C:/boate/blender/entrada"
AW, AH = 2048, 1024
RECTS = json.loads(bpy.data.scenes["ENT_ARTE"]["rects"])
PECAS = bpy.data.collections["PECAS_ENTRADA"]
MONT = bpy.data.collections["MONTAGEM"]

# limpa o que foi gerado antes
for col in (PECAS, MONT):
    for o in list(col.objects):
        if o.get("gerado"):
            bpy.data.objects.remove(o)
for me in [m for m in bpy.data.meshes if m.name.startswith("ENT_") and m.users == 0]:
    bpy.data.meshes.remove(me)

# materiais do atlas
atlas = bpy.data.images.load(RAIZ + "/tex/ent_atlas.png", check_existing=True)
atlas.name = "ENT_atlas"
def mat_arte(nome, luz):
    m = bpy.data.materials.get(nome) or bpy.data.materials.new(nome)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    saida = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = atlas
    tex.location = (-400, 0)
    saida.location = (300, 0)
    nt.links.new(bsdf.outputs['BSDF'], saida.inputs['Surface'])
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.55
    if luz:
        nt.links.new(tex.outputs['Color'], bsdf.inputs['Emission Color'])
        bsdf.inputs['Emission Strength'].default_value = luz
    m.use_backface_culling = False
mat_arte("ENT_arte", 0.0)
mat_arte("ENT_arte_luz", 0.7)

ESQ, CRO, VID, TIJ, PRETA = "ENT_metal_esquadria", "ENT_cromado", "ENT_vidro", "ENT_tijolo", "ENT_placa_preta"
ARTE, LUZ = "ENT_arte", "ENT_arte_luz"

def uv_arte(nome, lx, ly):
    x, y, w, h, lm, am, gira = RECTS[nome]
    k = (w / am if gira else w / lm) * 0.994
    px, py = (-ly * k, lx * k) if gira else (lx * k, ly * k)
    return ((x + w / 2 + px) / AW, (y + h / 2 + py) / AH)

class Peca:
    def __init__(self, nome, larg=0.0):
        self.nome, self.u0 = nome, larg / 2 / 2.4
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")
        self.mats = []

    def mi(self, m):
        if m not in self.mats:
            self.mats.append(m)
        return self.mats.index(m)

    def _acabar(self, verts, mat, liso=False):
        i = self.mi(mat)
        for f in {f for v in verts for f in v.link_faces}:
            f.material_index = i
            f.normal_update()
            n = f.normal
            eixo = max(range(3), key=lambda k: abs(n[k]))
            if liso and len(f.verts) == 4:
                f.smooth = True
            for l in f.loops:
                c = l.vert.co
                if eixo == 1:
                    u, v = (c.x if n.y < 0 else -c.x), c.z
                elif eixo == 0:
                    u, v = (c.y if n.x > 0 else -c.y), c.z
                else:
                    u, v = c.x, c.y
                l[self.uv].uv = (u / 2.4 + self.u0, v / 1.2)

    def caixa(self, mat, cx, cy, cz, sx, sy, sz):
        M = Matrix.Translation((cx, cy, cz)) @ Matrix.Diagonal((sx, sy, sz, 1))
        self._acabar(bmesh.ops.create_cube(self.bm, size=1.0, matrix=M)['verts'], mat)

    def cilindro(self, mat, p0, p1, r, seg=12, tampas=True):
        p0, p1 = Vector(p0), Vector(p1)
        d = p1 - p0
        M = Matrix.Translation((p0 + p1) / 2) @ d.to_track_quat('Z', 'Y').to_matrix().to_4x4()
        res = bmesh.ops.create_cone(self.bm, cap_ends=tampas, cap_tris=False, segments=seg, radius1=r, radius2=r, depth=d.length, matrix=M)
        self._acabar(res['verts'], mat, liso=True)

    def face(self, mat, pts, uvs=None):
        f = self.bm.faces.new([self.bm.verts.new(p) for p in pts])
        f.material_index = self.mi(mat)
        if uvs:
            for l, uv in zip(f.loops, uvs):
                l[self.uv].uv = uv
        return f

    def arte(self, mat, nome, cx, cz, y):
        lm, am = RECTS[nome][4], RECTS[nome][5]
        cantos = [(-lm / 2, -am / 2), (lm / 2, -am / 2), (lm / 2, am / 2), (-lm / 2, am / 2)]
        self.face(mat, [(cx + ax, y, cz + az) for ax, az in cantos], [uv_arte(nome, ax, az) for ax, az in cantos])

    def fim(self):
        self.bm.normal_update()
        me = bpy.data.meshes.new(self.nome)
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.mats:
            me.materials.append(bpy.data.materials[m])
        o = bpy.data.objects.new(self.nome, me)
        o["gerado"] = 1
        PECAS.objects.link(o)
        return o

feitas = []

# ---- paredes de tijolo ----
for nome, larg, prof in (("ENT_Parede_Tijolo", 2.4, 0.25), ("ENT_Parede_Tijolo_Meia", 1.2, 0.25), ("ENT_Pilar_Tijolo", 0.48, 0.48)):
    p = Peca(nome, larg)
    p.caixa(TIJ, 0, 0, 1.5, larg, prof, 3.0)
    feitas.append(p.fim())

# ---- batentes com bandeira de vidro ----
def vidro(p, x0, x1, z0, z1):
    p.face(VID, [(x0, 0, z0), (x1, 0, z0), (x1, 0, z1), (x0, 0, z1)])

def batente(nome, larg, jamba):
    p = Peca(nome, larg)
    P, vao = 0.12, larg - 2 * jamba
    for s in (-1, 1):
        p.caixa(ESQ, s * (larg - jamba) / 2, 0, 1.5, jamba, P, 3.0)
    p.caixa(ESQ, 0, 0, 2.97, vao, P, 0.06)
    p.caixa(ESQ, 0, 0, 2.44, vao, P, 0.08)
    p.caixa(ESQ, 0, 0, 0.0075, vao, P, 0.015)
    if larg > 2:
        p.caixa(ESQ, 0, 0, 2.71, 0.05, P, 0.46)
        vidro(p, -vao / 2, -0.025, 2.48, 2.94)
        vidro(p, 0.025, vao / 2, 2.48, 2.94)
    else:
        vidro(p, -vao / 2, vao / 2, 2.48, 2.94)
    feitas.append(p.fim())
batente("ENT_Batente_Duplo", 2.4, 0.08)
batente("ENT_Batente_Simples", 1.2, 0.04)

# ---- folha de porta de vidro (origem na dobradiça, no chão) ----
def puxador(p, x, y0, sentido, zc):
    y = y0 + sentido * 0.065
    p.cilindro(CRO, (x, y, zc - 0.33), (x, y, zc + 0.33), 0.015)
    for z in (zc - 0.2, zc + 0.2):
        p.cilindro(CRO, (x, y0, z), (x, y, z), 0.011, seg=8, tampas=False)

def porta(nome, lado):
    p = Peca(nome)
    L, A, E = 1.11, 2.375, 0.045
    p.caixa(ESQ, lado * 0.035, 0, A / 2, 0.07, E, A)
    p.caixa(ESQ, lado * (L - 0.035), 0, A / 2, 0.07, E, A)
    p.caixa(ESQ, lado * L / 2, 0, A - 0.035, L - 0.14, E, 0.07)
    p.caixa(ESQ, lado * L / 2, 0, 0.07, L - 0.14, E, 0.14)
    xs = sorted((lado * 0.07, lado * (L - 0.07)))
    vidro(p, xs[0], xs[1], 0.14, A - 0.07)
    for s in (-1, 1):
        puxador(p, lado * (L - 0.035), s * E / 2, s, 1.25)
    feitas.append(p.fim())
porta("ENT_Porta_Vidro_E", 1)
porta("ENT_Porta_Vidro_D", -1)

p = Peca("ENT_Puxador")
puxador(p, 0, 0, -1, 0)
feitas.append(p.fim())

# ---- cartazes, adesivos e placas (arte do atlas) ----
p = Peca("ENT_Cartaz_Porta")
p.arte(LUZ, "poster", 0, 0, 0)
feitas.append(p.fim())

p = Peca("ENT_Adesivo_Maiores")
p.arte(LUZ, "amarelo", 0, 0, 0)
feitas.append(p.fim())

p = Peca("ENT_Adesivo_ID")
circ = [(0.14 * math.cos(2 * math.pi * i / 32), 0.14 * math.sin(2 * math.pi * i / 32)) for i in range(32)]
p.face(LUZ, [(x, 0, z) for x, z in circ], [uv_arte("circulo", x, z) for x, z in circ])
feitas.append(p.fim())

def placa(nome, arte, mat, parafusos=True):
    lm, am = RECTS[arte][4], RECTS[arte][5]
    p = Peca(nome)
    p.caixa(PRETA, 0, -0.01, 0, lm + 0.04, 0.02, am + 0.04)
    p.arte(mat, arte, 0, 0, -0.0205)
    if parafusos:
        for sx in (-1, 1):
            for sz in (-1, 1):
                p.cilindro(CRO, (sx * (lm / 2 - 0.012), -0.02, sz * (am / 2 - 0.012)), (sx * (lm / 2 - 0.012), -0.026, sz * (am / 2 - 0.012)), 0.011, seg=8)
    feitas.append(p.fim())
placa("ENT_Placa_Regras", "regras", ARTE)
placa("ENT_Placa_Armas", "armas", ARTE)
placa("ENT_Placa_Logo", "logo", ARTE)
placa("ENT_Cartaz_Interno", "interno", LUZ, parafusos=False)

# ---- luminária de parede ----
p = Peca("ENT_Luminaria_Parede")
p.caixa(ESQ, 0, -0.01, 0, 0.17, 0.02, 0.24)
p.caixa(ESQ, 0, -0.06, 0, 0.14, 0.08, 0.2)
p.caixa("ENT_luz_lente", 0, -0.105, -0.005, 0.11, 0.02, 0.15)
p.caixa(ESQ, 0, -0.065, 0.107, 0.17, 0.13, 0.014)
feitas.append(p.fim())

# ---- toldo listrado (origem na linha de fixação na parede) ----
p = Peca("ENT_Toldo")
AV, QUEDA, N = 0.8, 0.35, 8
for i in range(N):
    x0, x1 = -0.8 + 0.2 * i, -0.6 + 0.2 * i
    m = "ENT_toldo_vinho" if i % 2 == 0 else "ENT_toldo_creme"
    p.face(m, [(x0, -AV, -QUEDA), (x1, -AV, -QUEDA), (x1, 0, 0), (x0, 0, 0)])
    arco = [((x0 + x1) / 2 + 0.1 * math.cos(math.pi + math.pi * k / 8), -AV, -QUEDA - 0.08 + 0.1 * math.sin(math.pi + math.pi * k / 8)) for k in range(1, 8)]
    p.face(m, [(x0, -AV, -QUEDA), (x0, -AV, -QUEDA - 0.08)] + arco + [(x1, -AV, -QUEDA - 0.08), (x1, -AV, -QUEDA)])
for s in (-1, 1):
    p.face("ENT_toldo_vinho", [(s * 0.8, 0, 0), (s * 0.8, -AV, -QUEDA), (s * 0.8, 0, -QUEDA)])
    p.cilindro(ESQ, (s * 0.8, 0, -QUEDA), (s * 0.8, -AV, -QUEDA), 0.012, seg=8)
p.cilindro(ESQ, (-0.8, -AV, -QUEDA), (0.8, -AV, -QUEDA), 0.012, seg=8)
feitas.append(p.fim())

# ---- corrimão ----
p = Peca("ENT_Corrimao")
for s in (-1, 1):
    p.cilindro(ESQ, (s * 0.7, 0, 0), (s * 0.7, 0, 0.95), 0.022)
    p.caixa(ESQ, s * 0.7, 0, 0.005, 0.1, 0.1, 0.01)
p.cilindro(ESQ, (-0.75, 0, 0.95), (0.75, 0, 0.95), 0.022)
p.cilindro(ESQ, (-0.7, 0, 0.5), (0.7, 0, 0.5), 0.016)
feitas.append(p.fim())

# ---- calçada (topo em z = 0) e degrau ----
p = Peca("ENT_Calcada")
p.caixa("ENT_concreto_escuro", 0, 0, -0.08, 2.4, 2.4, 0.14)
for sx in (-1, 1):
    for sy in (-1, 1):
        p.caixa("ENT_concreto", sx * 0.6, sy * 0.6, -0.075, 1.185, 1.185, 0.15)
feitas.append(p.fim())

p = Peca("ENT_Degrau")
p.caixa("ENT_concreto", 0, -0.175, 0.085, 1.2, 0.35, 0.17)
feitas.append(p.fim())

# ---- caixa eletrônico ----
p = Peca("ENT_Caixa_Eletronico")
CORPO, ESC = "ENT_atm_corpo", "ENT_atm_escuro"
p.caixa(ESC, 0, 0, 0.05, 0.54, 0.47, 0.1)
p.caixa(CORPO, 0, 0, 0.75, 0.52, 0.45, 1.3)
p.caixa(ESC, 0, -0.01, 1.5, 0.52, 0.47, 0.2)
p.arte(LUZ, "letreiro", 0, 1.5, -0.2455)
p.caixa(ESC, 0, -0.226, 1.14, 0.42, 0.01, 0.36)
p.arte(LUZ, "tela", 0, 1.17, -0.2315)
p.caixa(CORPO, 0, -0.28, 0.9, 0.52, 0.14, 0.05)
p.caixa(ESC, 0, -0.29, 0.931, 0.16, 0.09, 0.012)
p.caixa(ESC, 0.17, -0.228, 1.0, 0.07, 0.012, 0.02)
p.caixa("ENT_atm_led", 0.17, -0.229, 1.022, 0.05, 0.012, 0.008)
p.caixa(ESC, 0, -0.228, 0.7, 0.3, 0.012, 0.04)
feitas.append(p.fim())

# ---- jardineira ----
p = Peca("ENT_Jardineira")
p.caixa("ENT_vaso", 0, 0, 0.21, 0.9, 0.35, 0.42)
p.caixa("ENT_terra", 0, 0, 0.4, 0.84, 0.29, 0.05)
for i in range(18):
    a = i * 2.39996
    bx, by = -0.36 + 0.72 * ((i * 0.618) % 1), 0.08 * math.sin(i * 2.1)
    dx, dy = math.cos(a), math.sin(a) * 0.6
    n = math.hypot(dx, dy)
    qx, qy = -dy / n * 0.035, dx / n * 0.035
    h = 0.45 + 0.2 * ((i * 0.37) % 1)
    b, md, tp = (bx, by, 0.42), (bx + dx * 0.08, by + dy * 0.08, 0.42 + h * 0.6), (bx + dx * 0.25, by + dy * 0.25, 0.42 + h)
    p.face("ENT_planta", [(b[0] - qx, b[1] - qy, b[2]), (b[0] + qx, b[1] + qy, b[2]), (md[0] + qx * 1.2, md[1] + qy * 1.2, md[2]), (md[0] - qx * 1.2, md[1] - qy * 1.2, md[2])])
    p.face("ENT_planta", [(md[0] - qx * 1.2, md[1] - qy * 1.2, md[2]), (md[0] + qx * 1.2, md[1] + qy * 1.2, md[2]), tp])
feitas.append(p.fim())

# ---- prateleira: enfileira as peças no eixo X ----
cursor, resumo = 0.0, {}
for o in feitas:
    xs = [v.co.x for v in o.data.vertices]
    ys = [v.co.y for v in o.data.vertices]
    zs = [v.co.z for v in o.data.vertices]
    o.location = (cursor - min(xs), -6.0, 0)
    cursor += max(xs) - min(xs) + 0.4
    resumo[o.name] = {
        "tam": [round(max(xs) - min(xs), 3), round(max(ys) - min(ys), 3), round(max(zs) - min(zs), 3)],
        "tris": sum(len(f.vertices) - 2 for f in o.data.polygons),
        "mats": len(o.data.materials),
    }
bpy.ops.wm.save_mainfile()
result = {"pecas": len(feitas), "resumo": resumo, "tris_total": sum(r["tris"] for r in resumo.values())}
