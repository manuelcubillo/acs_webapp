"use client";

/**
 * StyleguideClient — live design-system reference.
 *
 * Sections:
 *   1. Mode + brand switcher (sticky topbar)
 *   2. Layer 1 — Primitive OKLCH ramps
 *   3. Layer 2 — Semantic tokens (shadcn roles + state + surface)
 *   4. Layer 3 — Density / radius / typography
 *   5. shadcn primitives — Button, Badge, Card, Input, Alert, Dialog, Tabs, Separator
 *   6. Scan-result demos (granted / denied / warning / override / info)
 *
 * Every visible color comes from a CSS variable. The whole page reacts to
 * mode + brand attribute changes instantly.
 */

import * as React from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  ShieldAlert,
  Moon,
  Sun,
  Monitor,
  ScanLine,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BRAND_VARIANTS, useThemeContext, type BrandVariant } from "@/components/providers/ThemeProvider";
import { cn } from "@/lib/utils";

// ─── Token catalog data ─────────────────────────────────────────────────────

const RAMP_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

interface RampSpec {
  name: string;
  prefix: string;
  description: string;
  reservedFor: string;
}

const PRIMITIVE_RAMPS: RampSpec[] = [
  { name: "Neutral",  prefix: "neutral", description: "Slate-leaning grays, hue 250", reservedFor: "backgrounds, borders, text" },
  { name: "Green",    prefix: "green",   description: "hue 145", reservedFor: "--state-granted" },
  { name: "Red",      prefix: "red",     description: "hue 25",  reservedFor: "--state-denied + --destructive" },
  { name: "Amber",    prefix: "amber",   description: "hue 80",  reservedFor: "--state-warning" },
  { name: "Orange",   prefix: "orange",  description: "hue 48 — distinct from amber", reservedFor: "--state-override" },
  { name: "Slate",    prefix: "slate",   description: "hue 240, blue-gray", reservedFor: "--state-info" },
];

const BRAND_RAMPS: RampSpec[] = [
  { name: "Indigo",  prefix: "indigo",  description: "hue 265 — default, modern", reservedFor: "data-brand=\"indigo\"" },
  { name: "Cobalt",  prefix: "cobalt",  description: "hue 240 — classic blue",    reservedFor: "data-brand=\"cobalt\"" },
  { name: "Violet",  prefix: "violet",  description: "hue 295 — high personality", reservedFor: "data-brand=\"violet\"" },
];

interface SemanticTokenSpec {
  name: string;
  fgName?: string;
  notes?: string;
}

const SHADCN_ROLES: SemanticTokenSpec[] = [
  { name: "background", fgName: "foreground", notes: "page-level surface" },
  { name: "card",       fgName: "card-foreground", notes: "elevated card" },
  { name: "popover",    fgName: "popover-foreground", notes: "menus, popovers" },
  { name: "primary",    fgName: "primary-foreground", notes: "brand cta — follows data-brand" },
  { name: "secondary",  fgName: "secondary-foreground" },
  { name: "muted",      fgName: "muted-foreground", notes: "subdued surface + secondary text" },
  { name: "accent",     fgName: "accent-foreground", notes: "hover/highlight + brand-tinted" },
  { name: "destructive", fgName: "destructive-foreground", notes: "delete / irreversible" },
];

interface StateSpec {
  key: "granted" | "denied" | "warning" | "override" | "info";
  label: string;
  description: string;
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}

const STATE_TOKENS: StateSpec[] = [
  { key: "granted",  label: "Granted",  description: "All validations passed.", Icon: CheckCircle2 },
  { key: "denied",   label: "Denied",   description: "Error-level validation failure — blocking.", Icon: AlertCircle },
  { key: "warning",  label: "Warning",  description: "Warning-level validation — informational.", Icon: AlertTriangle },
  { key: "override", label: "Override", description: "Operator override of validation error.", Icon: ShieldAlert },
  { key: "info",     label: "Info",     description: "Neutral event — scan log entry.", Icon: Info },
];

// ─── Sticky theme + brand switcher ──────────────────────────────────────────

function ControlBar() {
  const { theme, setTheme, brand, setBrand, resolvedTheme } = useThemeContext();

  return (
    <div className="sticky top-0 z-40 -mx-6 mb-10 border-b border-border bg-background/85 px-6 py-4 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-6">
        <div className="mr-auto flex flex-col">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Design system / dev only
          </span>
          <h1 className="font-heading text-xl font-bold text-foreground">Styleguide</h1>
        </div>

        <div className="flex items-center gap-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Mode</Label>
          <div className="flex gap-1 rounded-md border border-border p-1">
            <ThemeButton active={theme === "light"} onClick={() => setTheme("light")} icon={<Sun />} label="Light" />
            <ThemeButton active={theme === "dark"}  onClick={() => setTheme("dark")}  icon={<Moon />} label="Dark" />
            <ThemeButton active={theme === "system"} onClick={() => setTheme("system")} icon={<Monitor />} label="System" />
          </div>
          <span className="text-[10px] text-muted-foreground">
            {resolvedTheme ?? "—"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Brand</Label>
          <div className="flex gap-1 rounded-md border border-border p-1">
            {BRAND_VARIANTS.map((b) => (
              <BrandButton key={b} active={brand === b} onClick={() => setBrand(b)} variant={b} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ThemeButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-sm px-2 text-xs font-medium transition-colors",
        active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
      )}
      aria-pressed={active}
    >
      <span className="[&_svg]:size-3.5">{icon}</span>
      {label}
    </button>
  );
}

function BrandButton({ active, onClick, variant }: { active: boolean; onClick: () => void; variant: BrandVariant }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-sm px-2 text-xs font-medium capitalize transition-colors",
        active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
      )}
      aria-pressed={active}
    >
      <span
        aria-hidden
        className="inline-block size-3 rounded-full"
        style={{ background: `var(--${variant}-500)` }}
      />
      {variant}
    </button>
  );
}

// ─── Section wrapper ────────────────────────────────────────────────────────

function Section({ id, title, lead, children }: { id: string; title: string; lead?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-16 scroll-mt-24">
      <div className="mb-6">
        <h2 className="font-heading text-2xl font-bold tracking-tight text-foreground">{title}</h2>
        {lead && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{lead}</p>}
      </div>
      {children}
    </section>
  );
}

// ─── Ramp display ───────────────────────────────────────────────────────────

function RampRow({ ramp }: { ramp: RampSpec }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="font-heading text-sm font-semibold text-foreground">{ramp.name}</span>
          <span className="text-xs text-muted-foreground">{ramp.description}</span>
        </div>
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          {ramp.reservedFor}
        </span>
      </div>
      <div className="grid grid-cols-11 gap-1">
        {RAMP_STEPS.map((step) => {
          const varName = `--${ramp.prefix}-${step}`;
          return (
            <div
              key={step}
              className="flex flex-col overflow-hidden rounded-md border border-border"
              title={varName}
            >
              <div className="h-12 w-full" style={{ background: `var(${varName})` }} />
              <div className="bg-card px-1 py-1 text-center">
                <div className="font-mono text-[10px] text-foreground">{step}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Semantic swatch ────────────────────────────────────────────────────────

function SemanticSwatch({ token }: { token: SemanticTokenSpec }) {
  const bgVar = `var(--${token.name})`;
  const fgVar = token.fgName ? `var(--${token.fgName})` : "var(--foreground)";
  return (
    <div
      className="rounded-lg border p-4"
      style={{ background: bgVar, color: fgVar, borderColor: "var(--border)" }}
    >
      <div className="font-mono text-[11px] uppercase tracking-wider opacity-70">--{token.name}</div>
      <div className="mt-1 text-base font-semibold">The quick brown fox</div>
      {token.fgName && (
        <div className="mt-1 font-mono text-[10px] opacity-60">fg: --{token.fgName}</div>
      )}
      {token.notes && <div className="mt-2 text-xs opacity-75">{token.notes}</div>}
    </div>
  );
}

// ─── State panel ────────────────────────────────────────────────────────────

function StatePanel({ spec }: { spec: StateSpec }) {
  const { key, label, description, Icon } = spec;
  return (
    <div
      className="rounded-lg border-2 p-4"
      style={{
        background: `var(--state-${key})`,
        color: `var(--state-${key}-foreground)`,
        borderColor: `var(--state-${key}-border)`,
      }}
    >
      <div className="flex items-center gap-2">
        <Icon className="size-5" style={{ color: `var(--state-${key}-icon)` }} />
        <span className="font-heading text-base font-bold uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-2 text-sm">{description}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-[10px] opacity-70">
        <div>--state-{key}</div>
        <div>--state-{key}-foreground</div>
        <div>--state-{key}-border</div>
        <div>--state-{key}-icon</div>
      </div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function StyleguideClient() {
  const [dialogOpen, setDialogOpen] = React.useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <ControlBar />
      <div className="mx-auto max-w-6xl px-6 pb-24">

        {/* ─────────── Intro ─────────── */}
        <Section
          id="intro"
          title="ACS design system"
          lead="Three-layer OKLCH tokens. Brand-aware via data-brand on <html>. Dark mode via .dark class. Switch above and watch every primitive react."
        >
          <Card>
            <CardHeader>
              <CardTitle>How it composes</CardTitle>
              <CardDescription>
                Component → semantic token (Layer 2) → primitive ramp (Layer 1).
                Components NEVER reference Layer 1 directly.
              </CardDescription>
            </CardHeader>
            <CardContent className="font-mono text-xs leading-relaxed text-muted-foreground">
              <p>Button bg = <span className="text-foreground">bg-primary</span></p>
              <p>↓ resolves to <span className="text-foreground">var(--primary)</span></p>
              <p>↓ which is <span className="text-foreground">var(--brand-600)</span></p>
              <p>↓ which is <span className="text-foreground">var(--indigo-600)</span> when data-brand=&quot;indigo&quot;</p>
              <p>↓ or <span className="text-foreground">var(--cobalt-600)</span> when data-brand=&quot;cobalt&quot;</p>
              <p>↓ or <span className="text-foreground">var(--violet-600)</span> when data-brand=&quot;violet&quot;</p>
            </CardContent>
          </Card>
        </Section>

        {/* ─────────── Layer 1 — Primitive ramps ─────────── */}
        <Section
          id="ramps"
          title="Layer 1 — Primitive OKLCH ramps"
          lead="Raw color steps in oklch(). Reserved purposes are noted on the right. Components NEVER consume these directly."
        >
          <div className="space-y-8">
            {PRIMITIVE_RAMPS.map((r) => <RampRow key={r.prefix} ramp={r} />)}
          </div>
          <Separator className="my-8" />
          <h3 className="mb-4 font-heading text-lg font-semibold">Brand ramps</h3>
          <div className="space-y-8">
            {BRAND_RAMPS.map((r) => <RampRow key={r.prefix} ramp={r} />)}
          </div>
        </Section>

        {/* ─────────── Layer 2 — Semantic ─────────── */}
        <Section
          id="semantic"
          title="Layer 2 — Semantic tokens"
          lead="shadcn roles. Every primitive in src/components/ui/ reads from these."
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SHADCN_ROLES.map((t) => <SemanticSwatch key={t.name} token={t} />)}
          </div>
        </Section>

        {/* ─────────── Access-control state tokens ─────────── */}
        <Section
          id="states"
          title="Access-control state tokens"
          lead="RESERVED — never used decoratively. Every state ships color + icon + label so colorblind users do not depend on hue alone."
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {STATE_TOKENS.map((spec) => <StatePanel key={spec.key} spec={spec} />)}
          </div>
        </Section>

        {/* ─────────── Surfaces ─────────── */}
        <Section
          id="surfaces"
          title="Surface elevation"
          lead="Three depth levels. surface-1 = page, surface-2 = card, surface-3 = elevated (sidebars, dropdown rows)."
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {(["1", "2", "3"] as const).map((n) => (
              <div
                key={n}
                className="rounded-lg border p-6 text-sm"
                style={{ background: `var(--surface-${n})`, borderColor: "var(--border)" }}
              >
                <div className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                  --surface-{n}
                </div>
                <div className="mt-2 text-foreground">Elevated content.</div>
              </div>
            ))}
          </div>
        </Section>

        {/* ─────────── Layer 3 — Density / radius / typography ─────────── */}
        <Section
          id="density"
          title="Layer 3 — Density / radius / typography"
          lead="Comfortable defaults. A future [data-density=compact] overrides only this layer."
        >
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Radius scale</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-end gap-4">
                  {([
                    { name: "sm",  cls: "rounded-sm" },
                    { name: "md",  cls: "rounded-md" },
                    { name: "lg",  cls: "rounded-lg" },
                    { name: "xl",  cls: "rounded-xl" },
                    { name: "2xl", cls: "rounded-2xl" },
                  ]).map((r) => (
                    <div key={r.name} className="flex flex-col items-center gap-1">
                      <div className={cn("size-14 bg-primary", r.cls)} />
                      <span className="font-mono text-[10px] text-muted-foreground">{r.name}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Typography</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <p className="font-heading text-3xl font-bold text-foreground">Heading 3xl — Outfit</p>
                <p className="font-heading text-xl font-semibold text-foreground">Heading xl — Outfit</p>
                <p className="text-base text-foreground">Body base — DM Sans regular</p>
                <p className="text-sm text-muted-foreground">Body sm — DM Sans muted-foreground</p>
                <p className="font-mono text-xs text-muted-foreground">Mono xs — for code + token names</p>
              </CardContent>
            </Card>
          </div>
        </Section>

        {/* ─────────── shadcn primitives ─────────── */}
        <Section
          id="primitives"
          title="Primitive components"
          lead="Installed shadcn primitives reading from our tokens. Variants below propagate brand + dark instantly."
        >
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

            <Card>
              <CardHeader><CardTitle>Buttons</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Button>Default</Button>
                  <Button variant="secondary">Secondary</Button>
                  <Button variant="outline">Outline</Button>
                  <Button variant="ghost">Ghost</Button>
                  <Button variant="link">Link</Button>
                  <Button variant="destructive">Destructive</Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm">Small</Button>
                  <Button>Default</Button>
                  <Button size="lg">Large</Button>
                  <Button disabled>Disabled</Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Badges</CardTitle></CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Badge>Default</Badge>
                <Badge variant="secondary">Secondary</Badge>
                <Badge variant="outline">Outline</Badge>
                <Badge variant="destructive">Destructive</Badge>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Input + Label</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="sg-input">Card code</Label>
                  <Input id="sg-input" placeholder="e.g. RES-0042" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sg-input-disabled">Disabled</Label>
                  <Input id="sg-input-disabled" placeholder="Disabled input" disabled />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Tabs</CardTitle></CardHeader>
              <CardContent>
                <Tabs defaultValue="overview" className="w-full">
                  <TabsList>
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="activity">Activity</TabsTrigger>
                    <TabsTrigger value="audit">Audit</TabsTrigger>
                  </TabsList>
                  <TabsContent value="overview" className="pt-3 text-sm text-muted-foreground">
                    Overview content placeholder.
                  </TabsContent>
                  <TabsContent value="activity" className="pt-3 text-sm text-muted-foreground">
                    Activity content placeholder.
                  </TabsContent>
                  <TabsContent value="audit" className="pt-3 text-sm text-muted-foreground">
                    Audit content placeholder.
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Alerts (shadcn default)</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Alert>
                  <Info />
                  <AlertTitle>Default alert</AlertTitle>
                  <AlertDescription>Generic notification using card + border tokens.</AlertDescription>
                </Alert>
                <Alert variant="destructive">
                  <AlertCircle />
                  <AlertTitle>Destructive alert</AlertTitle>
                  <AlertDescription>Uses --destructive token. NOT for scan-denied — that uses --state-denied.</AlertDescription>
                </Alert>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Dialog</CardTitle></CardHeader>
              <CardContent>
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline">Open dialog</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Confirm action</DialogTitle>
                      <DialogDescription>
                        Token-driven modal — backdrop, surface, border, focus ring all from --background / --card / --border / --ring.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
                      <Button onClick={() => setDialogOpen(false)}>Confirm</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardContent>
            </Card>
          </div>
        </Section>

        {/* ─────────── Scan result patterns ─────────── */}
        <Section
          id="scan-patterns"
          title="Scan-result patterns"
          lead="The actual presentations the dashboard will use after Phase 2. Every state = state token + icon + label."
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <ScanResultDemo
              state="granted"
              icon={<CheckCircle2 />}
              code="RES-0042"
              cardType="Residente"
              title="Acceso permitido"
              detail="Todas las validaciones pasaron."
            />
            <ScanResultDemo
              state="warning"
              icon={<AlertTriangle />}
              code="RES-0118"
              cardType="Residente"
              title="Atención"
              detail="Una validación de advertencia: cuota mensual al 90%."
            />
            <ScanResultDemo
              state="denied"
              icon={<AlertCircle />}
              code="VIS-0017"
              cardType="Visitante"
              title="Acceso bloqueado"
              detail="Validación crítica: el carnet expiró hace 3 días."
            />
            <ScanResultDemo
              state="override"
              icon={<ShieldAlert />}
              code="VIS-0017"
              cardType="Visitante"
              title="Override manual"
              detail="El operador continuó pese al bloqueo. Queda registrado."
            />
            <ScanResultDemo
              state="info"
              icon={<ScanLine />}
              code="RES-0042"
              cardType="Residente"
              title="Evento de escaneo"
              detail="Entrada en el feed: no implica acceso concedido."
            />
          </div>
        </Section>

        <Separator className="my-12" />
        <p className="text-center font-mono text-[11px] text-muted-foreground">
          src/app/(dev)/styleguide · NODE_ENV={process.env.NODE_ENV ?? "?"} · routes 404 in production
        </p>
      </div>
    </div>
  );
}

// ─── Scan result demo card ──────────────────────────────────────────────────

function ScanResultDemo({
  state,
  icon,
  code,
  cardType,
  title,
  detail,
}: {
  state: StateSpec["key"];
  icon: React.ReactNode;
  code: string;
  cardType: string;
  title: string;
  detail: string;
}) {
  return (
    <div
      className="rounded-xl border-2 p-5"
      style={{
        background: `var(--state-${state})`,
        color: `var(--state-${state}-foreground)`,
        borderColor: `var(--state-${state}-border)`,
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex size-11 shrink-0 items-center justify-center rounded-lg border"
          style={{
            background: "var(--card)",
            borderColor: `var(--state-${state}-border)`,
            color: `var(--state-${state}-icon)`,
          }}
        >
          <span className="[&_svg]:size-5">{icon}</span>
        </div>
        <div className="flex-1">
          <div className="flex items-baseline gap-2">
            <span className="font-heading text-lg font-bold">{code}</span>
            <span
              className="rounded-md px-1.5 py-0.5 text-[11px] font-medium opacity-80"
              style={{ background: "var(--card)", color: "var(--muted-foreground)" }}
            >
              {cardType}
            </span>
          </div>
          <div className="mt-1 text-sm font-semibold">{title}</div>
          <p className="mt-1 text-xs opacity-85">{detail}</p>
        </div>
      </div>
    </div>
  );
}
