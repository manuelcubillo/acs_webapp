---
description: Sync docs/diagrams/acs-arquitectura.drawio with the current code (classes + workflows). Manual only.
argument-hint: "[baseline git ref — defaults to the diagram's last commit]"
allowed-tools: Read, Edit, Write, Bash, Grep, Glob
---

# Update the architecture diagram

Bring `docs/diagrams/acs-arquitectura.drawio` back in sync with the code.

**Manual only.** This command runs when the user types `/update-diagram` and never otherwise.
Do not register it in a hook, a `PostToolUse` handler, or `UPDATE-PROTOCOL.md`. If the user asks to
automate it, say that the diagram needs a human to confirm the layout before it is worth regenerating.

## Files

| Path | Role |
| ---- | ---- |
| `docs/diagrams/acs-arquitectura.drawio` | Source of truth. The one you edit. |
| `docs/diagrams/acs-arquitectura-mxgraphmodel.xml` | Derived: the bare `<mxGraphModel>` for **Extras → Editar diagrama**. Never edit by hand — regenerate it in step 6. |

## Sources of truth for the content

Read these before touching the XML. They outrank the diagram every time — if they disagree, the
diagram is the thing that is wrong.

- `src/lib/db/schema/access-control.ts` + `src/lib/db/schema/auth.ts` — entities, columns, enums.
- `docs/context/foundation/01-architecture.md` — table inventory, lifecycle, scan paths, roles.
- `docs/context/foundation/03-glossary.md` — the names the diagram must use.
- `docs/context/modules/{cards,card-types,actions,scanning,validations,auth-tenants}.md` — flows.
- `docs/context/decisions/` — only the ADRs referenced by a module's `Recent changes` since the baseline.

## Step 1 — Establish the baseline

```bash
git log -1 --format=%H -- docs/diagrams/acs-arquitectura.drawio
```

- `$1` given → use it as the baseline ref.
- Command prints a hash → that is the baseline.
- Prints nothing (file untracked or never committed) → there is no baseline. Review the whole
  diagram against the sources above instead of diffing, and say so in the final report.

## Step 2 — Find what changed

```bash
git diff --name-only <baseline>..HEAD -- src/lib/db/schema src/lib/dal src/lib/actions \
  src/lib/server src/lib/validation src/app/api docs/context
```

Map each touched path to the part of the diagram it affects:

| Touched | Diagram impact |
| ------- | -------------- |
| `src/lib/db/schema/**` | Zone 1: a class box, its attribute list, an enum in `note_enums`, or a relation edge. |
| `src/lib/server/lifecycle/**` | Zone 2 WF-D state machine (`wfc_*`) and/or the `wfc_note` rules. |
| `src/lib/actions/cards.ts`, `src/lib/dal/actions.ts` | Zone 2 WF-A operational scan pipeline (`wfa_*`). |
| `src/lib/validation/**` | WF-A `wfa_a7` / `wfa_d3`, and the ScanValidation class note. |
| `src/hooks/useExternalScanner.ts`, `src/components/cards/scanner/**` | `wfa_note_entry` (entry surfaces, HID threshold). |
| `src/app/(dashboard)/cards/[code]/**` | Zone 2 WF-B informational path (`wfb_*`). |
| `src/components/card-types/steps/**` | Zone 2 WF-C wizard steps (`wfd_s1..s5`). |
| `src/app/api/**` | Usually no diagram change — the diagram shows domain flow, not the route tree. |
| `docs/context/foundation/04-constraints.md` | `note_invariants`. |

State this list explicitly before editing. If nothing maps, stop and report "no diagram change
needed" — do not invent edits to look busy.

## Step 3 — Edit the XML

Use `Edit` on the `.drawio` file. Targeted edits only; never rewrite the whole file.

### Cell id conventions (keep them — they are how edges find their endpoints)

- `cls_<entity>` = class box · `cls_<entity>_b` = its attribute text child (`parent="cls_<entity>"`).
- `e_<source>_<target>` = a Zone 1 relation edge.
- `wfa_*` = WF-A operational scan · `wfb_*` = WF-B informational · `wfd_*` = WF-C wizard ·
  `wfc_*` = WF-D lifecycle state machine. (The `wfc`/`wfd` prefixes are swapped relative to the
  visible labels for historical reasons — go by the label text, not the prefix, and do not rename.)
- `note_*` / `legend` = annotation boxes.

### Zone 1 layout grid

Columns `x` = 60 · 380 · 700 · 1020 · 1340 · 1660. Rows `y` = 140 · 360 · 590 · 820. Class width 250.
Box height = `30 + 18 × <attribute lines> + 8`, rounded up to a multiple of 5. A new class takes a
free cell in that grid; only widen the zone container (`zone1_box`) if the grid genuinely fills up.

### Zone 2 layout

WF-A occupies `x` 60–1120, `y` 1220–2460. WF-B `x` 1180–1520 and WF-C `x` 1560–1900, both
`y` 1220–1780. WF-D `x` 1180–1900, `y` 1830–2460. Inserting a step means shifting the ones below it
and re-checking that no box overlaps — step 5 catches it if you miss one.

### Colour semantics (do not improvise new ones)

`#DAE8FC/#6C8EBF` nominal path and domain entity · `#FFE6CC/#D79B00` decision, config, override ·
`#F8CECC/#B85450` denial, block, delete · `#D5E8D4/#82B366` auth and success ·
`#E1D5E7/#9673A6` audit and the informational path · `#FFF2CC/#D6B656` notes.

### Hard XML rules — every one of these has already broken this file once

1. **No XML comments anywhere.** draw.io's decoder walks the children of `<root>` expecting
   `mxCell`; comment nodes there are a known failure. Also, `--` inside a comment is invalid XML.
2. **No double-escaped entities.** Never write `&amp;lt;`, `&amp;gt;`, `&amp;nbsp;`, `&amp;amp;`.
   One unescaping pass too many turns them into a raw `<` inside an attribute and the file dies.
   Need a "less than"? Write the words, or use `·`. Need indentation? Use plain spaces.
3. `&lt;br&gt;`, `&lt;b&gt;`, `&lt;i&gt;` are correct and required — single-level escaping only.
4. **No blank lines**, so reported line numbers stay meaningful.
5. Every `mxCell` needs a unique `id`; every edge needs `source` and `target` pointing at ids that
   exist; every vertex needs a real `x`/`y` (never `0,0`).
6. Keep everything inside `pageWidth="2000" pageHeight="2600"`.

## Step 4 — Keep the two zones consistent

A change usually lands in both halves. If you add a column that a flow reads, or a state that a
transition targets, update the class box *and* the workflow step that names it. The legend's promise —
that class names cited in Zone 2 steps are the same classes drawn in Zone 1 — must stay true.

## Step 5 — Validate before reporting

```bash
python3 - <<'PY'
import xml.etree.ElementTree as ET, re
p = "docs/diagrams/acs-arquitectura.drawio"
s = open(p, encoding="utf-8").read()
r = ET.fromstring(s)
cells = list(r.iter("mxCell"))
ids = [c.get("id") for c in cells]
edges = [c for c in cells if c.get("edge") == "1"]
problems = []
if s.count("&amp;"): problems.append("entidades doblemente escapadas")
if "<!--" in s: problems.append("comentarios XML")
if len(ids) != len(set(ids)): problems.append("ids duplicados")
for e in edges:
    for k in ("source", "target"):
        if e.get(k) not in ids: problems.append(f"{e.get('id')}.{k} apunta a {e.get(k)}")
for l in s.split("\n"):
    for m in re.finditer(r'\w+="([^"]*)"', l):
        if "<" in m.group(1) or ">" in m.group(1): problems.append("'<' crudo en atributo")
boxes = []
for v in (c for c in cells if c.get("vertex") == "1" and c.get("parent") == "1"):
    vid = v.get("id")
    if vid.endswith("_box") or vid.startswith("title_") or vid.endswith("_title"): continue
    g = v.find("mxGeometry")
    boxes.append((vid, *(float(g.get(k, 0)) for k in ("x", "y", "width", "height"))))
for i in range(len(boxes)):
    for j in range(i + 1, len(boxes)):
        a, b = boxes[i], boxes[j]
        if a[1] < b[1]+b[3] and b[1] < a[1]+a[3] and a[2] < b[2]+b[4] and b[2] < a[2]+a[4]:
            problems.append(f"solapan {a[0]} y {b[0]}")
    if boxes[i][1] == 0 and boxes[i][2] == 0: problems.append(f"{boxes[i][0]} en (0,0)")
print(f"{len(cells)} celdas · {len(edges)} conectores")
print("OK" if not problems else "FALLOS:\n  " + "\n  ".join(sorted(set(problems))))
PY
```

Anything other than `OK` means fix it and re-run. Do not report success on a failing validator.

## Step 6 — Regenerate the derived file

```bash
python3 - <<'PY'
s = open("docs/diagrams/acs-arquitectura.drawio", encoding="utf-8").read()
i, j = s.index("<mxGraphModel"), s.index("</mxGraphModel>") + len("</mxGraphModel>")
frag = "\n".join(l[4:] if l.startswith("    ") else l for l in s[i:j].split("\n")) + "\n"
open("docs/diagrams/acs-arquitectura-mxgraphmodel.xml", "w", encoding="utf-8").write(frag)
import xml.etree.ElementTree as ET; ET.fromstring(frag); print("derivado OK")
PY
```

## Step 7 — Report

Reply with exactly this, in Spanish, and nothing else:

```
Diagrama actualizado (baseline <ref o "sin baseline">):
- Zona 1 · <clase/relación> — <motivo en una línea>
- Zona 2 · <workflow y nodo> — <motivo en una línea>

Validación: <n> celdas · <n> conectores · OK
```

If nothing needed changing:

```
Diagrama ya sincronizado con <ref>. Sin cambios.
```

No prose, no apologies. Do not commit — leave the working tree for the user to review, and mention
the files are uncommitted only if they were untracked to begin with.

## Language

The diagram's visible text is **Spanish** (labels, notes, legend). Identifiers quoted inside it —
table names, columns, function names, enum values — stay verbatim in English as they appear in the
code. This file and the context docs are English; do not translate either direction.
