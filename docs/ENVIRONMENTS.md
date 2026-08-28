# Entornos

Mapa único de qué hace cada comando y contra qué se conecta. Si dudas de dónde
vas a escribir, mira la primera tabla.

**Regla de oro:** todo apunta a local por defecto. Para alcanzar algo remoto hay
que escribirlo en el comando (`:prod`, `:branch`). No existe ninguna forma de
llegar a producción por olvido.

---

## Tabla resumen

| Entorno | Comando | Base de datos | Fotos | Correo | Fichero de env |
|---|---|---|---|---|---|
| **Desarrollo** *(por defecto)* | `pnpm dev` | Docker `acs_dev` | MinIO local | consola | `.env` + `.env.development` + `.env.local` |
| **Tests** | `pnpm test` | Docker `acs_test` ⚠️ borra filas | MinIO local | consola | `.env.test.local` + `.env` |
| **Docker** *(ensayo de prod)* | `docker compose --profile all up` | Docker `acs_db` | MinIO contenedor | consola | `.env.docker` |
| **Rama de Neon** *(staging)* | `pnpm dev:branch` | Neon, rama `test` | según config | consola | `.env.neon-branch` |
| **Producción** ⚠️ | `pnpm dev:prod` | **Neon producción** | **R2 real** | consola | `.env.prod` |
| **Producción (real)** | despliegue en Vercel | Neon producción | R2 real | Resend real | variables del proyecto en Vercel |

Las cuatro bases de datos viven en el mismo contenedor `acs-postgres` salvo Neon:

| Base | Quién la usa | Contenido | ¿Se puede perder? |
|---|---|---|---|
| `acs_dev` | `pnpm dev` | copia de los datos de Veredillas | sí, recuperable con `pnpm db:pull-prod` |
| `acs_test` | `pnpm test` | fixtures `__test_*` | sí, la reconstruye `pnpm db:setup` |
| `acs_db` | perfil Docker | lo que dejes ahí | sí |
| `neondb` | Vercel / `:prod` | **los datos reales** | **NO** |

---

## Arranque desde cero

```bash
docker compose --profile db --profile storage up -d   # Postgres + MinIO

# Secretos locales (no se versionan). Genera valores propios:
cat > .env.local <<EOF
BETTER_AUTH_SECRET=$(openssl rand -hex 32)
CRON_SECRET=$(openssl rand -hex 32)
RESEND_APIKEY=
EOF
echo 'TEST_DATABASE_URL=postgresql://acs_user:acs_password@localhost:5432/acs_test' > .env.test.local

pnpm db:setup     # crea acs_dev y acs_test y aplica las migraciones
pnpm dev
```

`.env` y `.env.development` ya vienen en el repo con los valores buenos para
local, así que no hay nada más que configurar.

---

## Comandos por tarea

### Desarrollo

| Quiero | Comando | Va a |
|---|---|---|
| Levantar la app | `pnpm dev` | `acs_dev` |
| Levantar contra la rama de Neon | `pnpm dev:branch` | rama `test` |
| Levantar contra producción ⚠️ | `pnpm dev:prod` | **producción** |
| Traerme los datos de producción a local | `pnpm db:pull-prod` | vuelca prod → `acs_dev` |
| Datos de ejemplo | `pnpm db:seed` | `acs_dev` |

### Tests

| Quiero | Comando |
|---|---|
| Todo | `pnpm test` |
| Solo unitarios (sin base de datos) | `pnpm test:unit` |
| Solo integración | `pnpm test:integration` |
| En watch | `pnpm test:watch` |

Los de integración **crean y borran filas reales** en `acs_test`. Se niegan a
arrancar si `TEST_DATABASE_URL` falta, si apunta a Neon, o si es la misma base
que `DATABASE_URL` — ver `src/test/setup-integration.ts`.

### Migraciones

| Quiero | Comando | Va a |
|---|---|---|
| Generar el SQL desde el esquema | `pnpm db:generate` | escribe en `drizzle/` |
| Aplicar en local | `pnpm db:migrate:all` | `acs_dev` **y** `acs_test` |
| ...solo en dev | `pnpm db:migrate` | `acs_dev` |
| ...solo en test | `pnpm db:migrate:test` | `acs_test` |
| Ensayar en la rama de Neon | `pnpm db:migrate:branch` | rama `test` |
| Aplicar en producción ⚠️ | `pnpm db:migrate:prod` | **producción** |
| Abrir Drizzle Studio | `pnpm db:studio` / `:branch` / `:prod` | según sufijo |

**El orden correcto:** `db:generate` → revisar el SQL → `db:migrate:all` →
`db:migrate:branch` (ensayo con datos reales) → `db:migrate:prod`.

---

## El guard de base de datos

`src/lib/db/guard.ts` corta la conexión si el destino es un host `neon.tech` y
el runtime no es producción, salvo que exista `ALLOW_NEON_DB=1`. Esa variable
**no está en ningún fichero `.env`**: la inyectan los scripts `:prod` y
`:branch` de `package.json`, para que alcanzar producción siempre deje rastro en
el comando que escribiste.

Si ves este error, no lo saltes poniendo la variable a mano — casi siempre
significa que un fichero de env se ha quedado desfasado:

```
[src/lib/db] Refusing to connect to the remote database ...
```

---

## Secretos

Cada entorno tiene **su propio** `BETTER_AUTH_SECRET` y `CRON_SECRET`. No es
burocracia: si dev y producción comparten secreto de firma, una cookie de sesión
generada en tu portátil es válida en el sitio real.

`RESEND_APIKEY` está **vacía en todas partes menos en Vercel**. Con la clave
vacía, `src/lib/email/send.ts` no envía nada y vuelca el correo por consola con
el enlace de acción extraído — que es lo único que necesitas para seguir un
flujo de invitación o de reset:

```
┌─ EMAIL (not sent — RESEND_APIKEY is empty) ──────────────────────
│ to:      alguien@ejemplo.com
│ subject: Invitación a Veredillas II
│ link:    http://localhost:3000/invitations/abc123
└──────────────────────────────────────────────────────────────────
```

### Qué fichero define qué

| Variable | `.env` | `.env.development` | `.env.local` | `.env.test.local` | `.env.docker` | `.env.prod` | Vercel |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `DB_DRIVER` | ✅ local | | | *(forzado)* | ✅ local | ✅ neon | *(default neon)* |
| `DATABASE_URL` | ✅ | | | *(de TEST_…)* | ✅ | ✅ | ✅ |
| `TEST_DATABASE_URL` | | | | ✅ | | | |
| `BETTER_AUTH_SECRET` | | | ✅ | ✅ | ✅ | ✅ | ✅ |
| `BETTER_AUTH_URL` | | ✅ | | | ✅ | | ✅ |
| `NEXT_PUBLIC_BETTER_AUTH_URL` | | ✅ | | | ✅ | | ✅ |
| `CRON_SECRET` | | | ✅ | | ✅ | ✅ | ❌ **falta** |
| `RESEND_APIKEY` | | | vacía | vacía | vacía | vacía | ✅ |
| `STORAGE_DRIVER` / `S3_*` | ✅ minio | | | | ✅ minio | ✅ r2 | ✅ r2 |

**Prioridad** (gana el de más abajo): `.env` → `.env.development` → `.env.local`
→ overlay de `dotenv-cli` (`:prod` / `:branch`) → variables reales del proceso
(las de Vercel). Por eso un valor de `.env` versionado nunca puede pisar
producción.

`NEXT_PUBLIC_*` vive en `.env.development` y no en `.env` a propósito: esas
variables se incrustan en el bundle del cliente al hacer build, y Next solo
carga `.env.development` en `next dev` — nunca en un build de producción.

---

## Crear la rama de Neon

Una rama de Neon es un clon copy-on-write de producción: mismos datos, coste
casi cero, y **escribible sin tocar producción**. Es la forma correcta de probar
contra datos reales.

```bash
npx neonctl@latest auth                          # abre el navegador, una vez
npx neonctl@latest branches create --name test
npx neonctl@latest connection-string test --pooled
```

O desde https://console.neon.tech → Branches → *Create branch* → nombre `test`,
padre `production`, *Current point in time*.

Pega la cadena **pooled** en `DATABASE_URL` dentro de `.env.neon-branch` y ya
funciona `pnpm dev:branch`.

Cuando la rama se quede vieja, se refresca en segundos:

```bash
npx neonctl@latest branches reset test --parent
```

---

## Tareas pendientes

Tres cosas que no se pueden hacer desde aquí porque tocan producción:

### 1. Rellenar `S3_BUCKET` en `.env.prod`

En Vercel esa variable está marcada como *Sensitive*, y Vercel no permite volver
a leer el valor de una variable sensible — solo sobrescribirlo. Copia el nombre
del bucket desde el panel de Cloudflare R2. Sin él, `pnpm dev:prod` levanta pero
las fotos no cargan.

### 2. Activar el cron de purga en producción

`CRON_SECRET` **no existe** en el proyecto de Vercel. El cron diario de
`vercel.json` se ejecuta a las 03:00 UTC, llama a `/api/cron/purge-archived`, y
el endpoint lo rechaza siempre porque falla en cerrado sin ese secreto. Es decir:
la purga de la papelera nunca ha llegado a ejecutarse.

```bash
npx vercel env add CRON_SECRET production
# pega el valor que está en .env.prod
```

⚠️ Al activarlo, la primera ejecución **borrará físicamente** todo lo archivado
cuya retención (`archive_retention_days` por tenant) haya vencido. Comprueba
antes qué hay en la papelera.

### 3. Rotar `BETTER_AUTH_SECRET` de producción

Hoy producción usa el mismo secreto que había en `.env.local` y `.env.docker`.
Nunca llegó a git, así que la exposición es baja, pero el valor circuló por
ficheros de dev durante meses.

```bash
npx vercel env rm BETTER_AUTH_SECRET production
npx vercel env add BETTER_AUTH_SECRET production   # openssl rand -hex 32
npx vercel --prod                                  # redeploy
```

Efecto: cierra la sesión de los 4 usuarios; vuelven a entrar con su contraseña,
que no cambia. Actualiza también `BETTER_AUTH_SECRET` en `.env.prod` con el
mismo valor.

---

## Preguntas rápidas

**¿Contra qué está corriendo mi `pnpm dev`?** Contra `acs_dev`. Next lo dice al
arrancar: `Environments: .env.local, .env.development, .env`. Si ahí aparece
`.env.prod`, estás en producción.

**Rompí `acs_dev`.** `pnpm db:pull-prod` lo reconstruye desde producción.

**Rompí `acs_test`.** `pnpm db:setup` lo recrea.

**Los tests no arrancan.** Falta `.env.test.local`; el mensaje de error trae el
contenido exacto que necesita.

**Añadí una variable de entorno nueva.** Documéntala en `.env.example` (incluida
la fila de "definida en"), y añádela a los ficheros de los entornos que la
necesiten. Si es un secreto, a Vercel también.

**Las fotos no cargan con `pnpm db:pull-prod`.** Correcto: el volcado copia la
base de datos, no el bucket. Los object keys apuntan a R2 y local lee de MinIO.
