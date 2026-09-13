#!/usr/bin/env python3
"""Build the ACS demo video.

The script follows the commercial brochure (folleto-control-de-acceso.pdf):
same voice (usted), same narrative order — los tres pasos, el día a día,
control y trazabilidad, acompañamiento, CTA — and the same palette and
typography, so the video reads as the brochure in motion.

Scene kinds:
  shot     screenshot with title + subtitle
  section  full-bleed divider card (eyebrow + title + subtitle [+ bullets])
  cover    opening card
  cta      closing card with the contact block
"""
import os, subprocess, shutil

BASE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(BASE, "shots")
FRAMES = os.path.join(BASE, "frames")
TXT = os.path.join(BASE, "txt")
OUT = os.path.join(BASE, "acs-demo.mp4")

W, H = 1920, 1080
DARK = "0x162931"       # folleto: fondo oscuro
GREEN = "0x46976E"      # folleto: verde de acento
MUTED = "0xA7BAB9"      # texto secundario sobre fondo oscuro
LIGHT = "0xEFF3F2"      # folleto: banda clara
BOLD = "Avenir Next Demi Bold"
REG = "Avenir Next"
XF = 0.7                # crossfade

# kind, shot, eyebrow, title, subtitle, extras, seconds
SCENES = [
    # 1 · Portada
    ("cover", None, "Software de control de acceso para comunidades, instalaciones y empresas",
     "Simplifica el control de acceso",
     "Gestione quién entra, cuándo y con qué permisos, sin instalaciones complejas ni hardware dedicado.",
     None, 5.5),

    # 2 · Dashboard
    ("shot", "01-dashboard.jpg", None, "Todo el día a día en una pantalla",
     "El lector siempre listo y la actividad del recinto en tiempo real.", None, 6.0),

    # 3 · Escaneo
    ("shot", "41-scan-personal.jpg", None, "Un escaneo y la decisión está tomada",
     "El sistema valida el pase, aplica sus reglas y registra la entrada.", None, 6.0),
    ("shot", "42-scan-bono.jpg", None, "Vigencias y bonos",
     "El bono baja de 10 a 9 pases en el momento del acceso, sin apuntes manuales.", None, 6.0),
    ("shot", "43-scan-denied.jpg", None, "…o acceso denegado",
     "Si el pase no cumple las reglas, el sistema lo advierte y bloquea la operación.", None, 6.0),

    # 4 · Recinto
    ("shot", "44-recinto.jpg", None, "Quién está dentro, ahora mismo",
     "Entradas y salidas correlacionadas: la lista se mantiene sola.", None, 6.0),

    # 5 · Historial
    ("shot", "45-historial.jpg", None, "Registro y auditoría completos",
     "Quién, cuándo, con qué pase y con qué resultado, con el valor que tenía en ese momento.", None, 6.0),

    # 6 · Tipo de carnet
    ("shot", "46-tipo-personal.jpg", None, "Los datos que usted necesite",
     "Cada tipo de pase define sus propios campos, sus reglas y sus validaciones.", None, 6.0),

    # 7 · Diseño
    ("shot", "47-carnet-88787.jpg", None, "Pases con su imagen",
     "Su logotipo, sus colores, la foto del titular y el código listo para imprimir.", None, 6.0),
    ("shot", "20-design-editor.jpg", None, "Diseñe la apariencia",
     "Texto, imagen, QR y código de barras sobre el lienzo del pase.", None, 6.0),

    # 8 · Multiplataforma
    ("shot", "48-multiplataforma.jpg", None, "En el equipo que ya tiene",
     "Sin hardware dedicado: móvil, tablet u ordenador, sobre los mismos datos.", None, 6.0),

    # 9 · Servicio
    ("section", None, "Servicio", "No le entregamos un programa: le acompañamos",
     "El servicio incluye todo lo necesario para empezar a trabajar desde el primer día.",
     ["Adaptación a su caso", "Carga inicial de sus datos",
      "Puesta en marcha, formación y soporte", "Copias de seguridad automáticas"], 6.0),

    # 10 · Cierre
    ("cta", None, None, "Véalo funcionando en su instalación",
     "Solicite una demostración sin compromiso: en una sesión breve le mostramos el sistema con un caso como el suyo.",
     None, 6.0),
]

for d in (FRAMES, TXT):
    shutil.rmtree(d, ignore_errors=True)
    os.makedirs(d)


def tf(name, content):
    """Write a text file for drawtext (avoids escaping accents in the filter)."""
    p = os.path.join(TXT, name)
    with open(p, "w", encoding="utf-8") as f:
        f.write(content)
    return p.replace(":", r"\:")


def dt(font, path, size, color, x, y):
    return (f"drawtext=font='{font}':textfile='{path}':fontcolor={color}:"
            f"fontsize={size}:x={x}:y={y}")


def build_frame(i, kind, shot, eyebrow, title, sub, extras):
    out = os.path.join(FRAMES, f"{i:02d}.png")
    base = ["ffmpeg", "-y", "-f", "lavfi", "-i", f"color=c={DARK}:s={W}x{H}"]

    if kind == "shot":
        t = tf(f"{i:02d}-t.txt", title)
        s = tf(f"{i:02d}-s.txt", sub)
        chain = [
            # fit inside 1600x880 so wide compositions (the device slide) also fit
            "[1:v]scale=1600:880:force_original_aspect_ratio=decrease[shot]",
            "[0:v][shot]overlay=x=(W-w)/2:y=(170+1050-h)/2[bg]",
            f"[bg]{dt(BOLD, t, 52, 'white', 216, 54)}[a]",
            f"[a]{dt(REG, s, 30, MUTED, 216, 118)}[b]",
            f"[b]drawbox=x=170:y=56:w=7:h=96:color={GREEN}:t=fill[v]",
        ]
        cmd = base + ["-i", os.path.join(SHOTS, shot), "-frames:v", "1",
                      "-filter_complex", ";".join(chain), "-map", "[v]", out]
        subprocess.run(cmd, check=True, capture_output=True)
        return out

    # text-only cards — the whole block is centred vertically
    filters = [f"drawbox=x=0:y=0:w={W}:h={H}:color={DARK}:t=fill"]
    size = 92 if kind == "cover" else 74
    block = int(size * 1.35) + 60 + 90
    if eyebrow:
        block += 78
    if extras:
        block += 40 + (len(extras) * 54 if kind == "section" else 150)
    y = max(120, (H - block) // 2)

    if eyebrow:
        e = tf(f"{i:02d}-e.txt", eyebrow.upper())
        filters.append(dt(REG, e, 28, GREEN, "(w-tw)/2", y))
        y += 78

    t = tf(f"{i:02d}-t.txt", title)
    filters.append(dt(BOLD, t, size, "white", "(w-tw)/2", y))
    y += int(size * 1.35)

    filters.append(f"drawbox=x=(iw-180)/2:y={y}:w=180:h=5:color={GREEN}:t=fill")
    y += 60

    s = tf(f"{i:02d}-s.txt", sub)
    filters.append(dt(REG, s, 36, MUTED, "(w-tw)/2", y))
    y += 90

    if extras and kind == "section":
        # one text block so the items align left with each other, centred as a whole
        b = tf(f"{i:02d}-b.txt", "\n".join(f"·   {item}" for item in extras))
        filters.append(dt(REG, b, 32, LIGHT, "(w-tw)/2", y + 10) + ":line_spacing=22")
    elif extras and kind == "cta":
        y += 20
        box_w, box_h = 760, 150
        filters.append(f"drawbox=x=(iw-{box_w})/2:y={y}:w={box_w}:h={box_h}:color={GREEN}:t=fill")
        c0 = tf(f"{i:02d}-c0.txt", extras[0])
        c1 = tf(f"{i:02d}-c1.txt", extras[1])
        filters.append(dt(BOLD, c0, 38, "white", "(w-tw)/2", y + 36))
        filters.append(dt(REG, c1, 34, "white", "(w-tw)/2", y + 88))

    cmd = base + ["-frames:v", "1", "-vf", ",".join(filters), out]
    subprocess.run(cmd, check=True, capture_output=True)
    return out


frames = []
for i, (kind, shot, eyebrow, title, sub, extras, dur) in enumerate(SCENES):
    frames.append((build_frame(i, kind, shot, eyebrow, title, sub, extras), dur))

inputs = []
for path, dur in frames:
    inputs += ["-loop", "1", "-t", f"{dur:.2f}", "-i", path]

chain, offset, prev = [], 0.0, None
for idx, (path, dur) in enumerate(frames):
    if idx == 0:
        chain.append(f"[0:v]format=yuv420p,fps=30[v0]")
        prev, offset = "v0", dur - XF
        continue
    chain.append(f"[{idx}:v]format=yuv420p,fps=30[s{idx}]")
    chain.append(f"[{prev}][s{idx}]xfade=transition=fade:duration={XF}:offset={offset:.2f}[v{idx}]")
    prev = f"v{idx}"
    offset += dur - XF

subprocess.run(["ffmpeg", "-y", *inputs, "-filter_complex", ";".join(chain),
                "-map", f"[{prev}]", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                "-preset", "slow", "-crf", "20", "-movflags", "+faststart", OUT],
               check=True, capture_output=True)

total = sum(d for _, d in frames) - XF * (len(frames) - 1)
print(f"OK {OUT}  ~{total:.1f}s  {len(frames)} escenas")
