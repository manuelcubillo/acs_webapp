import { Client } from "pg";
const c = new Client({ connectionString: "postgresql://acs_user:acs_password@localhost:5432/acs_dev" });
await c.connect();
const r = await c.query("SELECT value_date FROM field_values WHERE value_date IS NOT NULL ORDER BY value_date DESC LIMIT 2");
for (const row of r.rows) {
  const v = row.value_date;
  console.log("typeof:", typeof v, "| instanceof Date:", v instanceof Date);
  console.log("  raw:", String(v));
  console.log("  toISOString:", v instanceof Date ? v.toISOString() : "(n/a)");
  console.log("  local Y-M-D:", v instanceof Date ? `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}` : "(n/a)");
}
console.log("process TZ:", Intl.DateTimeFormat().resolvedOptions().timeZone, "offset(min):", new Date().getTimezoneOffset());
await c.end();
