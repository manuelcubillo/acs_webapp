"use client";

import { useState, useEffect } from "react";

const MOCK_RESIDENT = {
  name: "María García López",
  photo: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=300&h=300&fit=crop&crop=face",
  status: "APTO",
  accessType: "Residente",
  subgroup: "Propietaria",
  address: { calle: "Av. de la Constitución", bloque: "B", piso: "4", letra: "A" },
  vigencia: "31/12/2026",
  observations: "Sin restricciones de horario",
  lastAccess: [
    { date: "02/03/2026", time: "08:32", result: "Permitido" },
    { date: "01/03/2026", time: "19:15", result: "Permitido" },
    { date: "01/03/2026", time: "07:48", result: "Permitido" },
    { date: "28/02/2026", time: "21:02", result: "Permitido" },
  ],
};

const MOCK_LOG = [
  { id: 1, hora: "08:32", nombre: "María García López", tipo: "Residente", unidad: "B-4A", resultado: "Permitido", accion: null },
  { id: 2, hora: "08:28", nombre: "Carlos Ruiz Martín", tipo: "Invitado", unidad: "A-2C", resultado: "Permitido", accion: "Entrada invitado de Ana Ruiz" },
  { id: 3, hora: "08:15", nombre: "Pedro Sánchez Díaz", tipo: "Residente", unidad: "C-1B", resultado: "Denegado", accion: null },
  { id: 4, hora: "08:01", nombre: "Laura Fernández Gil", tipo: "Especial", unidad: "D-3A", resultado: "Aprobado", accion: "Mantenimiento autorizado" },
  { id: 5, hora: "07:55", nombre: "Javier López Torres", tipo: "Residente", unidad: "B-6D", resultado: "Permitido", accion: null },
  { id: 6, hora: "07:42", nombre: "Elena Moreno Ruiz", tipo: "Invitado", unidad: "A-5B", resultado: "Permitido", accion: "Entrada familiar de J. Moreno" },
  { id: 7, hora: "07:30", nombre: "Roberto Jiménez Vega", tipo: "Residente", unidad: "C-2A", resultado: "Permitido", accion: null },
  { id: 8, hora: "07:18", nombre: "Isabel Navarro Cruz", tipo: "Residente", unidad: "B-1C", resultado: "Permitido", accion: null },
  { id: 9, hora: "07:05", nombre: "Antonio Delgado Pérez", tipo: "Residente", unidad: "A-3D", resultado: "Permitido", accion: null },
  { id: 10, hora: "06:58", nombre: "Sofía Ramírez Ortega", tipo: "Invitado", unidad: "B-2B", resultado: "Permitido", accion: "Entrada nieto de M. Ortega" },
  { id: 11, hora: "06:45", nombre: "Miguel Herrero Castro", tipo: "Residente", unidad: "D-5C", resultado: "Denegado", accion: null },
  { id: 12, hora: "06:32", nombre: "Carmen Blanco Serrano", tipo: "Especial", unidad: "A-1A", resultado: "Aprobado", accion: "Limpieza zonas comunes" },
  { id: 13, hora: "06:20", nombre: "Fernando Iglesias Ramos", tipo: "Residente", unidad: "C-4B", resultado: "Permitido", accion: null },
  { id: 14, hora: "06:11", nombre: "Lucía Domínguez Soto", tipo: "Residente", unidad: "B-3A", resultado: "Permitido", accion: null },
  { id: 15, hora: "06:02", nombre: "Pablo Medina Vargas", tipo: "Invitado", unidad: "D-2D", resultado: "Permitido", accion: "Visita autorizada por R. Vargas" },
  { id: 16, hora: "05:50", nombre: "Raquel Prieto Molina", tipo: "Residente", unidad: "A-6C", resultado: "Permitido", accion: null },
  { id: 17, hora: "05:38", nombre: "Andrés Cano Fuentes", tipo: "Especial", unidad: "C-3A", resultado: "Aprobado", accion: "Reparación fontanería" },
  { id: 18, hora: "05:25", nombre: "Teresa Vidal Romero", tipo: "Residente", unidad: "B-5B", resultado: "Permitido", accion: null },
  { id: 19, hora: "05:12", nombre: "Diego Muñoz Pascual", tipo: "Residente", unidad: "D-1C", resultado: "Denegado", accion: null },
  { id: 20, hora: "05:00", nombre: "Marta Reyes Aguilar", tipo: "Invitado", unidad: "A-4A", resultado: "Permitido", accion: "Entrada cuidadora de P. Aguilar" },
];

const NAV_ITEMS = [
  { id: "dashboard", label: "Vista Principal", icon: "grid" },
  { id: "residentes", label: "Residentes", icon: "users" },
  { id: "invitados", label: "Invitados", icon: "user-plus" },
  { id: "especiales", label: "Entradas Especiales", icon: "key" },
  { id: "estadisticas", label: "Estadísticas", icon: "trending" },
  { id: "admin", label: "Administración", icon: "shield" },
];

// --- SVG Icon components ---
function Icon({ name, size = 20 }) {
  const s = { width: size, height: size, strokeWidth: 1.8, stroke: "currentColor", fill: "none", strokeLinecap: "round", strokeLinejoin: "round" };
  const icons = {
    grid: <svg {...s} viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>,
    users: <svg {...s} viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    "user-plus": <svg {...s} viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>,
    key: <svg {...s} viewBox="0 0 24 24"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>,
    shield: <svg {...s} viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
    settings: <svg {...s} viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
    search: <svg {...s} viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
    clock: <svg {...s} viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
    check: <svg {...s} viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>,
    x: <svg {...s} viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
    alert: <svg {...s} viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
    trending: <svg {...s} viewBox="0 0 24 24"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
    home: <svg {...s} viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
    chevron: <svg {...s} viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>,
    door: <svg {...s} viewBox="0 0 24 24"><path d="M18 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/><circle cx="14" cy="12" r="1"/></svg>,
    filter: <svg {...s} viewBox="0 0 24 24"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>,
  };
  return icons[name] || null;
}

// --- Badge ---
function Badge({ type }) {
  const config = {
    Permitido: { bg: "#ecfdf5", text: "#059669", border: "#a7f3d0", label: "Permitido" },
    Denegado: { bg: "#fef2f2", text: "#dc2626", border: "#fecaca", label: "Denegado" },
    Aprobado: { bg: "#fffbeb", text: "#d97706", border: "#fde68a", label: "Aprobado" },
    Especial: { bg: "#fffbeb", text: "#d97706", border: "#fde68a", label: "Especial" },
  };
  const c = config[type] || config.Permitido;
  return (
    <span style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}`, padding: "3px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600, letterSpacing: 0.2 }}>
      {c.label}
    </span>
  );
}

// --- Donut Chart ---
function DonutChart() {
  const data = [
    { label: "Residentes", value: 128, color: "#3b82f6" },
    { label: "Invitados", value: 12, color: "#8b5cf6" },
    { label: "Especiales", value: 3, color: "#f59e0b" },
  ];
  const total = data.reduce((s, d) => s + d.value, 0);
  let cumulative = 0;
  const radius = 42, cx = 56, cy = 56, stroke = 12;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <svg width={112} height={112} viewBox="0 0 112 112">
        {data.map((d, i) => {
          const pct = d.value / total;
          const circumference = 2 * Math.PI * radius;
          const dashLen = pct * circumference;
          const dashOffset = -cumulative * circumference;
          cumulative += pct;
          return (
            <circle key={i} cx={cx} cy={cy} r={radius} fill="none" stroke={d.color} strokeWidth={stroke}
              strokeDasharray={`${dashLen} ${circumference - dashLen}`} strokeDashoffset={dashOffset}
              strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`} style={{ transition: "all .5s ease" }} />
          );
        })}
        <text x={cx} y={cy - 4} textAnchor="middle" style={{ fontSize: 20, fontWeight: 700, fill: "#1a1d2e", fontFamily: "'Outfit', sans-serif" }}>{total}</text>
        <text x={cx} y={cy + 12} textAnchor="middle" style={{ fontSize: 9, fill: "#8b8fa3", fontWeight: 500 }}>DENTRO</text>
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {data.map((d, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#5a5f7a" }}>
            <span style={{ width: 8, height: 8, borderRadius: 3, background: d.color, flexShrink: 0 }} />
            <span style={{ fontWeight: 500 }}>{d.label}</span>
            <span style={{ fontWeight: 700, color: "#1a1d2e", marginLeft: "auto" }}>{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Stats View ---
function StatsView() {
  const MOCK_MONTHLY = [
    { mes: "Oct", entradas: 1820 },
    { mes: "Nov", entradas: 2105 },
    { mes: "Dic", entradas: 1950 },
    { mes: "Ene", entradas: 2340 },
    { mes: "Feb", entradas: 2180 },
    { mes: "Mar", entradas: 1420 },
  ];
  const maxVal = Math.max(...MOCK_MONTHLY.map(m => m.entradas));

  const MOCK_HOURLY = [
    { hora: "06h", pct: 15 }, { hora: "08h", pct: 72 }, { hora: "10h", pct: 45 },
    { hora: "12h", pct: 38 }, { hora: "14h", pct: 52 }, { hora: "16h", pct: 35 },
    { hora: "18h", pct: 80 }, { hora: "20h", pct: 58 }, { hora: "22h", pct: 22 },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }} className="card-animate">
      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        {[
          { label: "Entradas hoy", value: "143", sub: "+12 vs ayer", color: "#4f5bff" },
          { label: "Actualmente dentro", value: "143", sub: "Residentes + invitados", color: "#059669" },
          { label: "Denegaciones hoy", value: "3", sub: "0.02% del total", color: "#dc2626" },
          { label: "Promedio diario", value: "187", sub: "Últimos 30 días", color: "#d97706" },
        ].map((k, i) => (
          <div key={i} style={{ background: "#fff", borderRadius: 16, border: "1px solid #edeef2", boxShadow: "0 2px 8px rgba(0,0,0,0.04)", padding: "20px 22px" }}>
            <div style={{ fontSize: 12, color: "#8b8fa3", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>{k.label}</div>
            <div style={{ fontSize: 30, fontWeight: 800, fontFamily: "'Outfit', sans-serif", color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 12, color: "#8b8fa3", marginTop: 4 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Donut + Bar charts */}
      <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 20 }}>
        {/* Donut */}
        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #edeef2", boxShadow: "0 2px 8px rgba(0,0,0,0.04)", padding: 28 }}>
          <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "'Outfit', sans-serif", color: "#1a1d2e", marginBottom: 22 }}>
            Distribución en Recinto
          </div>
          <DonutChart />
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #f3f4f6" }}>
            <div style={{ fontSize: 12, color: "#8b8fa3", marginBottom: 8 }}>Capacidad máxima: <span style={{ fontWeight: 700, color: "#1a1d2e" }}>320</span></div>
            <div style={{ height: 8, borderRadius: 6, background: "#f3f4f6", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(143/320)*100}%`, background: "linear-gradient(90deg, #4f5bff, #7c3aed)", borderRadius: 6, transition: "width .5s ease" }} />
            </div>
            <div style={{ fontSize: 12, color: "#8b8fa3", marginTop: 6 }}>Ocupación: <span style={{ fontWeight: 700, color: "#4f5bff" }}>44.7%</span></div>
          </div>
        </div>

        {/* Monthly bar chart */}
        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #edeef2", boxShadow: "0 2px 8px rgba(0,0,0,0.04)", padding: 28 }}>
          <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "'Outfit', sans-serif", color: "#1a1d2e", marginBottom: 22 }}>
            Accesos Mensuales
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height: 140 }}>
            {MOCK_MONTHLY.map((m, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, height: "100%", justifyContent: "flex-end" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#1a1d2e" }}>{m.entradas.toLocaleString()}</span>
                <div style={{ width: "100%", height: `${(m.entradas / maxVal) * 100}%`, background: i === MOCK_MONTHLY.length - 1 ? "linear-gradient(180deg, #4f5bff, #7c3aed)" : "#e8eaff", borderRadius: "6px 6px 0 0", transition: "height .5s ease" }} />
                <span style={{ fontSize: 12, color: "#8b8fa3", fontWeight: 500 }}>{m.mes}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Hourly heatmap */}
      <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #edeef2", boxShadow: "0 2px 8px rgba(0,0,0,0.04)", padding: 28 }}>
        <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "'Outfit', sans-serif", color: "#1a1d2e", marginBottom: 20 }}>
          Actividad por Hora del Día
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          {MOCK_HOURLY.map((h, i) => (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#5a5f7a" }}>{h.pct}%</div>
              <div style={{
                width: "100%", height: 80, borderRadius: 8, position: "relative", overflow: "hidden",
                background: "#f3f4f6",
              }}>
                <div style={{
                  position: "absolute", bottom: 0, width: "100%", height: `${h.pct}%`,
                  background: h.pct > 60 ? "linear-gradient(180deg, #4f5bff, #7c3aed)" : h.pct > 35 ? "#93c5fd" : "#dbeafe",
                  borderRadius: "6px 6px 0 0", transition: "height .5s ease",
                }} />
              </div>
              <div style={{ fontSize: 11, color: "#8b8fa3" }}>{h.hora}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Main App ---
export default function AccessControlDashboard() {
  const [activeNav, setActiveNav] = useState("dashboard");
  const [activeFilter, setActiveFilter] = useState("Hoy");
  const [searchLog, setSearchLog] = useState("");
  const [typeFilter, setTypeFilter] = useState("Todos");
  const [scanInput, setScanInput] = useState("");
  const [showResident, setShowResident] = useState(true);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatDate = (d) => {
    const days = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    return `${days[d.getDay()]}, ${d.getDate()} de ${months[d.getMonth()]} de ${d.getFullYear()}`;
  };
  const formatTime = (d) => d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const filteredLog = MOCK_LOG.filter(entry => {
    const matchSearch = entry.nombre.toLowerCase().includes(searchLog.toLowerCase());
    const matchType = typeFilter === "Todos" || entry.tipo === typeFilter;
    return matchSearch && matchType;
  });

  const statusColors = { APTO: "#059669", "NO APTO": "#dc2626", RESTRINGIDO: "#d97706" };
  const statusBg = { APTO: "#ecfdf5", "NO APTO": "#fef2f2", RESTRINGIDO: "#fffbeb" };
  const statusBorder = { APTO: "#a7f3d0", "NO APTO": "#fecaca", RESTRINGIDO: "#fde68a" };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap');

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body { font-family: 'DM Sans', sans-serif; background: #f6f7f9; color: #1a1d2e; -webkit-font-smoothing: antialiased; }

        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 3px; }

        .sidebar-item { display: flex; align-items: center; gap: 12px; padding: 10px 16px; border-radius: 10px; cursor: pointer; transition: all 0.2s ease; color: #6b7094; font-size: 13.5px; font-weight: 500; }
        .sidebar-item:hover { background: #f0f1f5; color: #1a1d2e; }
        .sidebar-item.active { background: #eef0ff; color: #4f5bff; font-weight: 600; }

        .filter-btn { padding: 6px 14px; border-radius: 8px; border: 1px solid #e5e7eb; background: #fff; cursor: pointer; font-size: 12.5px; font-weight: 500; color: #6b7094; transition: all 0.15s ease; font-family: 'DM Sans', sans-serif; }
        .filter-btn:hover { border-color: #c7c9d9; }
        .filter-btn.active { background: #1a1d2e; color: #fff; border-color: #1a1d2e; }

        .scan-input { width: 100%; padding: 12px 16px; border: 2px solid #e5e7eb; border-radius: 12px; font-size: 14px; font-family: 'DM Sans', sans-serif; outline: none; transition: all 0.2s ease; background: #fafbfc; }
        .scan-input:focus { border-color: #4f5bff; background: #fff; box-shadow: 0 0 0 3px rgba(79,91,255,0.1); }
        .scan-input::placeholder { color: #b0b4c8; }

        .search-bar { padding: 8px 14px 8px 36px; border: 1px solid #e5e7eb; border-radius: 10px; font-size: 13px; font-family: 'DM Sans', sans-serif; outline: none; background: #f6f7f9; width: 260px; transition: all .2s; }
        .search-bar:focus { border-color: #4f5bff; background: #fff; width: 300px; }

        .table-row { display: grid; grid-template-columns: 60px 1.5fr 0.8fr 0.7fr 0.8fr 1.5fr; align-items: center; padding: 12px 20px; border-bottom: 1px solid #f3f4f6; font-size: 13.5px; transition: background 0.1s; }
        .table-row:hover { background: #fafbfd; }
        .table-header { font-size: 11.5px; color: #8b8fa3; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; background: #fafbfc; border-bottom: 1px solid #edeef2; }
        .table-header:hover { background: #fafbfc; }

        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulseGlow { 0%, 100% { box-shadow: 0 0 0 0 rgba(5,150,105,0); } 50% { box-shadow: 0 0 0 8px rgba(5,150,105,0.1); } }

        .card-animate { animation: fadeIn 0.4s ease-out; }
        .status-pulse { animation: pulseGlow 2.5s ease-in-out infinite; }
      `}</style>

      <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>

        {/* ===== SIDEBAR ===== */}
        <aside style={{ width: 240, background: "#fff", borderRight: "1px solid #edeef2", display: "flex", flexDirection: "column", padding: "20px 14px", flexShrink: 0 }}>
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 12px 24px", borderBottom: "1px solid #f3f4f6", marginBottom: 20 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: "linear-gradient(135deg, #4f5bff, #7c3aed)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="shield" size={18} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "'Outfit', sans-serif", color: "#1a1d2e", lineHeight: 1.2 }}>AccesoGuard</div>
              <div style={{ fontSize: 10.5, color: "#8b8fa3", fontWeight: 500 }}>Control de Acceso</div>
            </div>
          </div>

          {/* Nav */}
          <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
            {NAV_ITEMS.map(item => (
              <div key={item.id} className={`sidebar-item ${activeNav === item.id ? "active" : ""}`} onClick={() => setActiveNav(item.id)}>
                <Icon name={item.icon} size={18} />
                {item.label}
              </div>
            ))}
          </nav>

          {/* Settings */}
          <div style={{ borderTop: "1px solid #f3f4f6", paddingTop: 12, marginTop: 8 }}>
            <div className="sidebar-item" onClick={() => setActiveNav("config")}>
              <Icon name="settings" size={18} />
              Configuración
            </div>
          </div>
        </aside>

        {/* ===== MAIN CONTENT ===== */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Top Bar */}
          <header style={{ height: 60, background: "#fff", borderBottom: "1px solid #edeef2", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 28px", flexShrink: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#1a1d2e", fontFamily: "'Outfit', sans-serif" }}>
              {NAV_ITEMS.find(i => i.id === activeNav)?.label ?? "Vista Principal"}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ position: "relative" }}>
                <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#b0b4c8" }}>
                  <Icon name="search" size={15} />
                </div>
                <input className="search-bar" placeholder="Buscar residente, unidad..." />
              </div>
              <div style={{ width: 1, height: 24, background: "#e5e7eb" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#5a5f7a" }}>
                <Icon name="clock" size={15} />
                <span style={{ fontSize: 13, fontWeight: 500 }}>{formatDate(now)}</span>
                <span style={{ fontSize: 14, fontWeight: 700, fontFamily: "'Outfit', sans-serif", color: "#1a1d2e", background: "#f3f4f6", padding: "3px 10px", borderRadius: 7, minWidth: 72, textAlign: "center", letterSpacing: 0.5 }}>{formatTime(now)}</span>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1d2e" }}>Portero García</div>
                <div style={{ fontSize: 11, color: "#8b8fa3" }}>Turno mañana</div>
              </div>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #e0e7ff, #c7d2fe)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, color: "#4f5bff", fontFamily: "'Outfit', sans-serif" }}>
                PG
              </div>
            </div>
          </header>

          {/* Dashboard Content */}
          <main style={{ flex: 1, overflow: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>

            {activeNav === "estadisticas" && <StatsView />}
            {activeNav !== "estadisticas" && <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* ROW 1: Scanner (full-width) */}
            <div className="card-animate">
              <input
                className="scan-input"
                placeholder="🔍  Escanear tarjeta o buscar residente por nombre, DNI o unidad..."
                value={scanInput}
                onChange={e => setScanInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") setShowResident(true); }}
              />
            </div>

            {/* ROW 2: Resident Card + Observations & Last Access */}
            {showResident && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20, alignItems: "stretch" }} className="card-animate">

                {/* Resident Card */}
                <div style={{
                  background: "#fff", borderRadius: 16, border: "1px solid #edeef2", boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                  display: "flex", overflow: "hidden", position: "relative"
                }}>
                  {/* Status stripe */}
                  <div style={{ width: 5, background: statusColors[MOCK_RESIDENT.status], flexShrink: 0 }} />

                  {/* Photo */}
                  <div style={{ padding: 24, display: "flex", alignItems: "center", flexShrink: 0 }}>
                    <div style={{ width: 110, height: 110, borderRadius: 14, overflow: "hidden", border: `3px solid ${statusBorder[MOCK_RESIDENT.status]}`, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
                      <img src={MOCK_RESIDENT.photo} alt="Residente" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </div>
                  </div>

                  {/* Info */}
                  <div style={{ padding: "24px 24px 24px 0", flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 2 }}>
                      <span style={{ fontSize: 20, fontWeight: 700, fontFamily: "'Outfit', sans-serif", color: "#1a1d2e" }}>
                        {MOCK_RESIDENT.name}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ padding: "3px 10px", borderRadius: 6, fontSize: 11.5, fontWeight: 600, background: "#eef0ff", color: "#4f5bff" }}>
                        {MOCK_RESIDENT.accessType}
                      </span>
                      <span style={{ padding: "3px 10px", borderRadius: 6, fontSize: 11.5, fontWeight: 500, background: "#f3f4f6", color: "#5a5f7a" }}>
                        {MOCK_RESIDENT.subgroup}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: "#6b7094", lineHeight: 1.6, marginTop: 2 }}>
                      {MOCK_RESIDENT.address.calle} · Bloque {MOCK_RESIDENT.address.bloque} · Piso {MOCK_RESIDENT.address.piso}{MOCK_RESIDENT.address.letra}
                    </div>
                    <div style={{ fontSize: 12, color: "#8b8fa3" }}>
                      Vigencia: <span style={{ fontWeight: 600, color: "#5a5f7a" }}>{MOCK_RESIDENT.vigencia}</span>
                    </div>
                  </div>

                  {/* Status Badge - THE dominant element */}
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    padding: "20px 36px", flexShrink: 0
                  }}>
                    <div className="status-pulse" style={{
                      background: statusBg[MOCK_RESIDENT.status],
                      border: `2px solid ${statusBorder[MOCK_RESIDENT.status]}`,
                      borderRadius: 14,
                      padding: "16px 32px",
                      textAlign: "center",
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: statusColors[MOCK_RESIDENT.status], letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 4 }}>
                        Estado
                      </div>
                      <div style={{
                        fontSize: 28, fontWeight: 800, color: statusColors[MOCK_RESIDENT.status],
                        fontFamily: "'Outfit', sans-serif", letterSpacing: 1,
                      }}>
                        {MOCK_RESIDENT.status}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, marginTop: 6 }}>
                        <Icon name="check" size={14} />
                        <span style={{ fontSize: 11, color: statusColors[MOCK_RESIDENT.status], fontWeight: 500 }}>Acceso permitido</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right: Observations + Last Access stacked */}
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {/* Observations */}
                  <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #edeef2", boxShadow: "0 2px 8px rgba(0,0,0,0.04)", padding: 18 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "'Outfit', sans-serif", color: "#1a1d2e", marginBottom: 10 }}>
                      Observaciones
                    </div>
                    <div style={{ fontSize: 13, color: "#5a5f7a", lineHeight: 1.6, padding: "8px 12px", background: "#fafbfc", borderRadius: 10, border: "1px solid #f3f4f6" }}>
                      {MOCK_RESIDENT.observations}
                    </div>
                  </div>

                  {/* Recent Access */}
                  <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #edeef2", boxShadow: "0 2px 8px rgba(0,0,0,0.04)", padding: 18, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "'Outfit', sans-serif", color: "#1a1d2e", marginBottom: 10 }}>
                      Últimos Accesos
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {MOCK_RESIDENT.lastAccess.map((a, i) => (
                        <div key={i} style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "7px 10px", background: "#fafbfc", borderRadius: 8, border: "1px solid #f3f4f6",
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ color: "#8b8fa3" }}>
                              <Icon name="clock" size={13} />
                            </div>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "#1a1d2e" }}>{a.time}</div>
                              <div style={{ fontSize: 10.5, color: "#8b8fa3" }}>{a.date}</div>
                            </div>
                          </div>
                          <Badge type={a.result} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ROW 3: Full-width Access Log Table */}
            <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #edeef2", boxShadow: "0 2px 8px rgba(0,0,0,0.04)", overflow: "hidden", minHeight: 480, display: "flex", flexDirection: "column" }}
                 className="card-animate">
              {/* Table Header */}
              <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, fontFamily: "'Outfit', sans-serif", color: "#1a1d2e" }}>Registro de Accesos</span>
                  <span style={{ fontSize: 11, background: "#f3f4f6", padding: "2px 8px", borderRadius: 6, fontWeight: 600, color: "#6b7094" }}>
                    {filteredLog.length}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {["Hoy", "Semana", "Mes"].map(f => (
                    <button key={f} className={`filter-btn ${activeFilter === f ? "active" : ""}`} onClick={() => setActiveFilter(f)}>{f}</button>
                  ))}
                  <div style={{ width: 1, height: 20, background: "#e5e7eb", margin: "0 4px" }} />
                  <select
                    value={typeFilter}
                    onChange={e => setTypeFilter(e.target.value)}
                    style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff", fontSize: 12.5, fontFamily: "'DM Sans'", color: "#5a5f7a", cursor: "pointer", outline: "none" }}
                  >
                    <option value="Todos">Todos los tipos</option>
                    <option value="Residente">Residente</option>
                    <option value="Invitado">Invitado</option>
                    <option value="Especial">Especial</option>
                  </select>
                  <div style={{ position: "relative" }}>
                    <div style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "#b0b4c8" }}>
                      <Icon name="search" size={13} />
                    </div>
                    <input
                      value={searchLog}
                      onChange={e => setSearchLog(e.target.value)}
                      placeholder="Buscar..."
                      style={{ padding: "6px 10px 6px 28px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff", fontSize: 12.5, fontFamily: "'DM Sans'", outline: "none", width: 140, transition: "width .2s" }}
                      onFocus={e => e.target.style.width = "180px"}
                      onBlur={e => e.target.style.width = "140px"}
                    />
                  </div>
                </div>
              </div>

              {/* Table */}
              <div style={{ flex: 1, overflow: "auto" }}>
                <div className="table-row table-header">
                  <span>Hora</span><span>Nombre</span><span>Tipo</span><span>Unidad</span><span>Resultado</span><span>Acción</span>
                </div>
                {filteredLog.map(entry => (
                  <div key={entry.id} className="table-row">
                    <span style={{ fontWeight: 600, color: "#5a5f7a", fontFamily: "'Outfit', sans-serif", fontSize: 13 }}>
                      {entry.hora}
                    </span>
                    <span style={{ fontWeight: 500, color: "#1a1d2e" }}>{entry.nombre}</span>
                    <span>
                      <span style={{
                        padding: "2px 8px", borderRadius: 5, fontSize: 11.5, fontWeight: 600,
                        background: entry.tipo === "Residente" ? "#eef0ff" : entry.tipo === "Invitado" ? "#f3e8ff" : "#fffbeb",
                        color: entry.tipo === "Residente" ? "#4f5bff" : entry.tipo === "Invitado" ? "#8b5cf6" : "#d97706",
                      }}>
                        {entry.tipo}
                      </span>
                    </span>
                    <span style={{ color: "#5a5f7a", fontWeight: 500 }}>{entry.unidad}</span>
                    <span><Badge type={entry.resultado} /></span>
                    <span style={{ color: "#8b8fa3", fontSize: 12.5, fontStyle: entry.accion ? "normal" : "italic" }}>
                      {entry.accion || "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            </div>}
          </main>
        </div>
      </div>
    </>
  );
}
