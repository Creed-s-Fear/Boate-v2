import bpy, math
from mathutils import Vector

RAIZ = "C:/boate/blender/entrada"
cena = bpy.data.scenes["ENTRADA"]
MONT = bpy.data.collections["MONTAGEM"]
PREV = bpy.data.collections["PREVIA"]
for o in list(MONT.objects) + list(PREV.objects):
    bpy.data.objects.remove(o)

def por(nome, x, y, z, giro=0.0, pai=None):
    o = bpy.data.objects[nome].copy()      # duplicata ligada: mesma malha
    o["gerado"] = 1
    o.location = (x, y, z)
    o.rotation_euler = (0, 0, math.radians(giro))
    o.parent = pai
    MONT.objects.link(o)
    return o

def porta_com_cartaz(lado, x, giro=0.0, adesivos=True):
    d = por("ENT_Porta_Vidro_" + ("E" if lado > 0 else "D"), x, 0, 0.02, giro)
    cx = lado * 0.555
    por("ENT_Cartaz_Porta", cx, -0.008, 1.2225, pai=d)
    if adesivos:
        por("ENT_Adesivo_Maiores", cx, -0.011, 2.18, pai=d)
        por("ENT_Adesivo_ID", cx, -0.010, 1.955, pai=d)
    return d

# fachada, da esquerda para a direita (frente = -Y)
por("ENT_Parede_Tijolo", -3.0, 0, 0)
por("ENT_Placa_Logo", -2.55, -0.125, 2.42)
por("ENT_Placa_Regras", -2.55, -0.125, 1.58)
por("ENT_Placa_Armas", -2.55, -0.125, 0.76)
por("ENT_Batente_Simples", -1.2, 0, 0)
porta_com_cartaz(1, -1.755)
por("ENT_Batente_Simples", 0.0, 0, 0)
porta_com_cartaz(-1, 0.555, giro=-78, adesivos=False)
por("ENT_Batente_Duplo", 1.8, 0, 0)
porta_com_cartaz(1, 0.685)
porta_com_cartaz(-1, 2.915)
por("ENT_Parede_Tijolo_Meia", 3.6, 0, 0)
por("ENT_Luminaria_Parede", 3.6, -0.125, 2.55)
por("ENT_Pilar_Tijolo", 4.44, -0.115, 0)
por("ENT_Parede_Tijolo", 5.88, 0, 0)
por("ENT_Toldo", 5.88, -0.125, 2.75)
por("ENT_Corrimao", 5.6, -1.25, 0)
por("ENT_Jardineira", 6.3, -0.4, 0)
por("ENT_Degrau", 4.44, -0.355, 0)
for x in (-3.0, -0.6, 1.8, 4.2, 6.6):
    por("ENT_Calcada", x, -1.2, 0)
# interior visto pela porta aberta
for x in (-0.6, 1.8):
    por("ENT_Calcada", x, 1.2, 0)
    por("ENT_Parede_Tijolo", x, 2.525, 0)
por("ENT_Caixa_Eletronico", -0.25, 2.1, 0)
por("ENT_Cartaz_Interno", 0.75, 2.4, 1.6)

# luzes e câmeras só para conferir (coleção PREVIA, não exportada)
def luz(nome, tipo, pos, cor, energia, raio=0.15):
    d = bpy.data.lights.new(nome, tipo)
    d.color, d.energy = cor, energia
    if tipo == 'POINT':
        d.shadow_soft_size = raio
    o = bpy.data.objects.new(nome, d)
    o.location = pos
    PREV.objects.link(o)
    return o

def camera(nome, pos, alvo, lente=None, orto=None):
    d = bpy.data.cameras.new(nome)
    if orto:
        d.type, d.ortho_scale = 'ORTHO', orto
    else:
        d.lens = lente
    o = bpy.data.objects.new(nome, d)
    o.location = pos
    o.rotation_euler = (Vector(alvo) - Vector(pos)).to_track_quat('-Z', 'Y').to_euler()
    PREV.objects.link(o)
    return o

luz("PREV_lampada", 'POINT', (3.6, -0.45, 2.5), (1.0, 0.95, 0.85), 120)
luz("PREV_rosa_dentro", 'POINT', (0.3, 1.2, 2.5), (1.0, 0.15, 0.5), 500)
luz("PREV_rosa_fundo", 'POINT', (1.8, 1.6, 2.2), (1.0, 0.1, 0.35), 300)
luz("PREV_azul_rua", 'POINT', (-1.5, -3.0, 3.2), (0.25, 0.4, 1.0), 500, 0.6)
luz("PREV_verde_rua", 'POINT', (-4.5, -2.0, 2.6), (0.3, 0.9, 0.6), 120, 0.6)
sol = luz("PREV_sol", 'SUN', (10, -12, 10), (1, 1, 1), 3.0)
sol.rotation_euler = (math.radians(55), 0, math.radians(15))
cam_noite = camera("PREV_cam_fachada", (-2.2, -5.2, 1.55), (0.9, 0.0, 1.5), lente=26)
cam_frente = camera("PREV_cam_frente", (1.44, -9.0, 1.6), (1.44, 0.0, 1.5), lente=24)
larg_prat = max(o.location.x for o in bpy.data.collections["PECAS_ENTRADA"].objects) + 1.5
cam_prat = camera("PREV_cam_prateleira", (larg_prat / 2, -20, 5), (larg_prat / 2, -6, 1.3), orto=larg_prat + 1)

mundo = bpy.data.worlds.get("ENT_previa") or bpy.data.worlds.new("ENT_previa")
cena.world = mundo
def fundo(cor):
    mundo.color = cor
    if mundo.node_tree:
        for n in mundo.node_tree.nodes:
            if n.type == 'BACKGROUND':
                n.inputs[0].default_value = (*cor, 1)

cena.render.engine = 'BLENDER_EEVEE'
cena.eevee.taa_render_samples = 32
ims = cena.render.image_settings
if hasattr(ims, "media_type"):
    ims.media_type = 'IMAGE'
ims.file_format = 'PNG'
ims.color_mode = 'RGB'

def tirar(nome, cam, w, h, noite):
    sol.hide_render = noite
    fundo((0.004, 0.005, 0.012) if noite else (0.35, 0.37, 0.4))
    cena.camera = cam
    cena.render.resolution_x, cena.render.resolution_y, cena.render.resolution_percentage = w, h, 100
    cena.render.filepath = RAIZ + "/previa/" + nome + ".png"
    bpy.ops.render.render(write_still=True, scene="ENTRADA")

tirar("fachada_noite", cam_noite, 1420, 728, True)
tirar("fachada_dia", cam_frente, 1600, 640, False)
tirar("prateleira", cam_prat, 2000, 420, False)
fundo((0.004, 0.005, 0.012))
cena.camera = cam_noite
bpy.ops.wm.save_mainfile()
result = {"montagem": len(MONT.objects), "previa": len(PREV.objects), "prateleira_m": round(larg_prat, 2)}
