# Vídeo de presentación

Montaje comercial del producto a partir de capturas reales de la aplicación.
El guion sigue el folleto `folleto-control-de-acceso.pdf`: misma voz (usted),
mismo orden narrativo y misma identidad visual (fondo `#162931`, verde
`#46976E`, Avenir Next).

## Archivos

| Ruta | Qué es |
|---|---|
| `build.py` | Genera el vídeo: compone cada plano y los une con fundidos |
| `shots/` | Capturas de la aplicación (fuente de los planos) |
| `acs-demo.mp4` | Montaje actual — 13 escenas, ~56 s, 1080p |
| `acs-demo-v0-guion-tecnico.mp4` | Primera versión, antes de adoptar la voz del folleto |
| `frames/`, `txt/` | Intermedios que regenera `build.py` (no se versionan) |

## Regenerar

```bash
python3 build.py
```

Requiere `ffmpeg` con `libfreetype` y `xfade`, y la fuente **Avenir Next**
(estándar en macOS; en otro sistema, cambiar `BOLD` / `REG` en `build.py` por
una familia instalada).

## Editar el guion

Toda la narrativa vive en la lista `SCENES` de `build.py`. Cada entrada es
`(kind, shot, eyebrow, title, subtitle, extras, segundos)`:

- `kind`: `cover` (portada), `section` (separador), `shot` (captura), `cta` (cierre).
- `shot`: nombre del archivo dentro de `shots/`, o `None` en las tarjetas de texto.
- `extras`: viñetas en un `section`; en el `cta`, las dos líneas del bloque de
  contacto — hoy es `None`, por lo que el cierre sale sin datos de contacto.

## Datos de la demo

Las capturas salen del tenant local **"Comunidad de vecinos"** (`acs_dev`,
`pnpm demo:seed`). Carnets usados: **88787** (Acceso personal, Lucía Fuentes
Arroyo) y **88777** / **59631** (Bono accesos, con pases y sin pases).

`shots/` conserva también capturas de versiones anteriores del guion (tipos de
carnet, asistente, listados, tema oscuro, miembros) por si hacen falta en un
montaje futuro; el guion actual solo usa las que nombra `SCENES`.
