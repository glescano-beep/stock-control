import { useState, useEffect, useRef, useCallback } from "react";

const SUPABASE_URL = "https://alikskdyvsaslpcpeytr.supabase.co";
const SUPABASE_KEY = "sb_publishable_ASahJWjMJ4cuqwmfuwiaqA_so5SxWxl";

async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || "Error");
  return data;
}

async function signOut(token) {
  await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
  });
}

async function getProfile(userId, token) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=*`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return data[0] || null;
}

async function sb(path, options = {}, token) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${token || SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: options.prefer || "return=representation",
    },
    ...options,
  });
  if (!res.ok) { const e = await res.text(); throw new Error(e); }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function adminCreateUser(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Error al crear usuario");
  return data;
}

const CATEGORIES = ["Electrónica", "Alimentos", "Ropa", "Herramientas", "Limpieza", "Oficina", "Otro"];

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ─── BARCODE SCANNER con Quagga2 ─────────────────────────────────────────────
function BarcodeScanner({ onDetected }) {
  const scannerRef = useRef(null);
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(true);
  const [manual, setManual] = useState("");
  const detectedRef = useRef(false);

  useEffect(() => {
    let Quagga;
    async function start() {
      try {
        const mod = await import("@ericblade/quagga2");
        Quagga = mod.default;

        await new Promise((resolve, reject) => {
          Quagga.init({
            inputStream: {
              type: "LiveStream",
              target: scannerRef.current,
              constraints: {
                facingMode: "environment",
                width: { ideal: 1280 },
                height: { ideal: 720 },
              },
            },
            decoder: {
              readers: ["ean_reader", "ean_8_reader", "code_128_reader", "code_39_reader", "upc_reader", "upc_e_reader"],
            },
            locate: true,
          }, (err) => {
            if (err) { reject(err); return; }
            resolve();
          });
        });

        Quagga.start();
        setStarting(false);

        Quagga.onDetected((result) => {
          if (detectedRef.current) return;
          const code = result?.codeResult?.code;
          if (code) {
            detectedRef.current = true;
            // Vibrar si el dispositivo lo soporta
            if (navigator.vibrate) navigator.vibrate(100);
            onDetected(code);
          }
        });
      } catch (e) {
        setError("No se pudo acceder a la cámara. Usá el campo manual.");
        setStarting(false);
      }
    }

    start();

    return () => {
      try { if (Quagga) { Quagga.stop(); Quagga.offDetected(); } } catch {}
    };
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", background: "#0a0c12", aspectRatio: "4/3" }}>
        {/* Quagga renderiza el video acá */}
        <div ref={scannerRef} style={{ width: "100%", height: "100%" }} />

        {/* Overlay de apuntado */}
        {!error && !starting && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <div style={{ width: "80%", height: "25%", border: "2px solid #5b8def", borderRadius: 8, boxShadow: "0 0 0 9999px rgba(0,0,0,0.4)" }} />
          </div>
        )}

        {starting && !error && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, background: "#0a0c12" }}>
            <div style={{ width: 32, height: 32, border: "3px solid #1e2130", borderTop: "3px solid #5b8def", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            <div style={{ color: "#8b90a8", fontSize: 13 }}>Iniciando cámara...</div>
          </div>
        )}

        {error && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, textAlign: "center", fontSize: 13, color: "#f0904a", background: "#0a0c12" }}>
            📷 {error}
          </div>
        )}

        {/* Texto de ayuda */}
        {!error && !starting && (
          <div style={{ position: "absolute", bottom: 10, left: 0, right: 0, textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
            Apuntá el código de barras al recuadro azul
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div>
        <label style={{ fontSize: 12, color: "#8b90a8", fontWeight: 500, display: "block", marginBottom: 6 }}>
          O ingresá el código manualmente:
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            style={{ flex: 1, background: "#1e2130", border: "1px solid #252839", borderRadius: 9, padding: "10px 14px", color: "#e8eaf0", fontSize: 15, fontFamily: "monospace", outline: "none" }}
            placeholder="Ej: 7891234560001"
            value={manual}
            onChange={e => setManual(e.target.value)}
            onKeyDown={e => e.key === "Enter" && manual.trim() && onDetected(manual.trim())}
          />
          <button
            onClick={() => manual.trim() && onDetected(manual.trim())}
            style={{ background: "#5b8def", color: "#fff", border: "none", borderRadius: 9, padding: "10px 18px", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
            Buscar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    if (!email || !password) return setError("Completá todos los campos");
    setLoading(true); setError("");
    try {
      const session = await signIn(email, password);
      const profile = await getProfile(session.user.id, session.access_token);
      onLogin({ session, profile });
    } catch { setError("Email o contraseña incorrectos"); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0f1117", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ width: 60, height: 60, background: "#5b8def", borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, margin: "0 auto 14px" }}>📦</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#e8eaf0" }}>StockControl</div>
          <div style={{ fontSize: 13, color: "#8b90a8", marginTop: 4 }}>Technik</div>
        </div>
        <div style={{ background: "#161921", border: "1px solid #252839", borderRadius: 16, padding: 28 }}>
          {[{ label: "Email", key: "email", type: "email", ph: "tu@email.com", val: email, set: setEmail },
            { label: "Contraseña", key: "pass", type: "password", ph: "••••••••", val: password, set: setPassword }].map(f => (
            <div key={f.key} style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: "#8b90a8", fontWeight: 500, display: "block", marginBottom: 6 }}>{f.label}</label>
              <input style={{ background: "#1e2130", border: "1px solid #252839", borderRadius: 9, padding: "11px 14px", color: "#e8eaf0", fontSize: 14, width: "100%", outline: "none", boxSizing: "border-box" }}
                type={f.type} placeholder={f.ph} value={f.val} onChange={e => f.set(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleLogin()} />
            </div>
          ))}
          {error && <div style={{ background: "#3d1f26", border: "1px solid #5c2d38", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#f06b7a", marginBottom: 16 }}>{error}</div>}
          <button onClick={handleLogin} disabled={loading}
            style={{ width: "100%", background: "#5b8def", color: "#fff", border: "none", borderRadius: 9, padding: 12, fontSize: 15, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1 }}>
            {loading ? "Ingresando..." : "Ingresar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function StockApp() {
  const [auth, setAuth] = useState(null);
  const [view, setView] = useState("dashboard");
  const [products, setProducts] = useState([]);
  const [movements, setMovements] = useState([]);
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("Todas");
  const [modalType, setModalType] = useState(null);
  const [editProduct, setEditProduct] = useState(null);
  const [movProduct, setMovProduct] = useState(null);
  const [movQty, setMovQty] = useState(1);
  const [movType, setMovType] = useState("entrada");
  const [movReason, setMovReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [form, setForm] = useState({ name: "", barcode: "", category: "Otro", description: "", stock: 0, min_stock: 5, price: 0 });
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPass, setNewUserPass] = useState("");
  const [newUserRole, setNewUserRole] = useState("operador");
  const [creatingUser, setCreatingUser] = useState(false);

  const isAdmin = auth?.profile?.role === "admin";
  const token = auth?.session?.access_token;
  const userName = auth?.session?.user?.email?.split("@")[0] || "Usuario";

  const showToast = (msg, type = "ok") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

  const loadAll = useCallback(async () => {
    if (!token) return;
    try {
      const [prods, movs] = await Promise.all([
        sb("products?select=*&order=name.asc", {}, token),
        sb("movements?select=*&order=created_at.desc&limit=200", {}, token),
      ]);
      setProducts(prods || []);
      setMovements(movs || []);
    } catch { showToast("Error conectando con la base de datos", "err"); }
  }, [token]);

  const loadUsers = useCallback(async () => {
    if (!token || !isAdmin) return;
    try {
      const data = await sb("profiles?select=*&order=created_at.asc", {}, token);
      setUsers(data || []);
    } catch { showToast("Error cargando usuarios", "err"); }
  }, [token, isAdmin]);

  useEffect(() => { if (token) { loadAll(); if (isAdmin) loadUsers(); } }, [loadAll, loadUsers]);

  if (!auth) return <LoginScreen onLogin={setAuth} />;

  const alerts = products.filter(p => p.stock <= p.min_stock);
  const totalStock = products.reduce((a, b) => a + (b.stock || 0), 0);
  const totalValue = products.reduce((a, b) => a + (b.stock || 0) * (b.price || 0), 0);

  const openNewProduct = () => { setEditProduct(null); setForm({ name: "", barcode: "", category: "Otro", description: "", stock: 0, min_stock: 5, price: 0 }); setModalType("product"); };
  const openEditProduct = (p) => { setEditProduct(p); setForm({ name: p.name, barcode: p.barcode || "", category: p.category || "Otro", description: p.description || "", stock: p.stock, min_stock: p.min_stock, price: p.price }); setModalType("product"); };

  const saveProduct = async () => {
    if (!form.name.trim()) return showToast("El nombre es requerido", "err");
    setSaving(true);
    try {
      const data = { ...form, stock: Number(form.stock), min_stock: Number(form.min_stock), price: Number(form.price) };
      if (editProduct) { await sb(`products?id=eq.${editProduct.id}`, { method: "PATCH", body: JSON.stringify(data) }, token); showToast("Producto actualizado ✓"); }
      else { await sb("products", { method: "POST", body: JSON.stringify(data) }, token); showToast("Producto creado ✓"); }
      await loadAll(); setModalType(null);
    } catch { showToast("Error al guardar", "err"); } finally { setSaving(false); }
  };

  const deleteProduct = async (id) => {
    if (!confirm("¿Eliminar este producto?")) return;
    try { await sb(`products?id=eq.${id}`, { method: "DELETE", prefer: "return=minimal" }, token); showToast("Eliminado"); await loadAll(); }
    catch { showToast("Error al eliminar", "err"); }
  };

  const openMovement = (p) => { setMovProduct(p); setMovQty(1); setMovType("entrada"); setMovReason(""); setModalType("movement"); };

  const saveMovement = async () => {
    if (!movReason.trim()) return showToast("Ingresá el motivo", "err");
    const qty = Number(movQty);
    if (qty <= 0) return showToast("Cantidad inválida", "err");
    if (movType === "salida" && movProduct.stock < qty) return showToast("Stock insuficiente", "err");
    setSaving(true);
    try {
      const newStock = movType === "entrada" ? movProduct.stock + qty : movProduct.stock - qty;
      await sb(`products?id=eq.${movProduct.id}`, { method: "PATCH", body: JSON.stringify({ stock: newStock }) }, token);
      await sb("movements", { method: "POST", body: JSON.stringify({ product_id: movProduct.id, product_name: movProduct.name, type: movType, qty, reason: movReason, user: userName }) }, token);
      showToast(`${movType === "entrada" ? "Entrada" : "Salida"} registrada ✓`);
      await loadAll(); setModalType(null);
    } catch { showToast("Error al registrar", "err"); } finally { setSaving(false); }
  };

  const handleScanDetected = (code) => {
    const found = products.find(p => p.barcode === code.trim());
    setModalType(null);
    setTimeout(() => {
      if (found) openMovement(found);
      else { showToast(`Código no encontrado`, "err"); if (isAdmin) { setForm(f => ({ ...f, barcode: code })); openNewProduct(); } }
    }, 200);
  };

  const handleCreateUser = async () => {
    if (!newUserEmail.trim() || !newUserPass.trim()) return showToast("Completá email y contraseña", "err");
    setCreatingUser(true);
    try {
      const newUser = await adminCreateUser(newUserEmail, newUserPass);
      await sb(`profiles?id=eq.${newUser.id}`, { method: "PATCH", body: JSON.stringify({ role: newUserRole }) }, token);
      showToast("Usuario creado ✓");
      setNewUserEmail(""); setNewUserPass(""); setNewUserRole("operador");
      await loadUsers();
    } catch (e) { showToast(e.message || "Error al crear usuario", "err"); }
    finally { setCreatingUser(false); }
  };

  const changeUserRole = async (userId, role) => {
    try {
      await sb(`profiles?id=eq.${userId}`, { method: "PATCH", body: JSON.stringify({ role }) }, token);
      showToast("Rol actualizado ✓");
      await loadUsers();
    } catch { showToast("Error al cambiar rol", "err"); }
  };

  const filtered = products.filter(p => {
    const s = search.toLowerCase();
    return (p.name?.toLowerCase().includes(s) || p.barcode?.includes(s)) && (filterCat === "Todas" || p.category === filterCat);
  });

  const S = {
    page: { fontFamily: "system-ui, sans-serif", background: "#0f1117", minHeight: "100vh", color: "#e8eaf0" },
    header: { background: "#12141c", borderBottom: "1px solid #1e2130", padding: "0 14px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 56, position: "sticky", top: 0, zIndex: 40 },
    card: { background: "#161921", border: "1px solid #252839", borderRadius: 14, overflow: "hidden" },
    btnPrimary: { background: "#5b8def", color: "#fff", border: "none", borderRadius: 9, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
    btnGhost: { background: "#1e2130", color: "#8b90a8", border: "1px solid #252839", borderRadius: 9, padding: "7px 12px", fontSize: 13, cursor: "pointer" },
    btnDanger: { background: "#3d1f26", color: "#f06b7a", border: "1px solid #5c2d38", borderRadius: 9, padding: "7px 10px", fontSize: 13, cursor: "pointer" },
    input: { background: "#1e2130", border: "1px solid #252839", borderRadius: 9, padding: "10px 14px", color: "#e8eaf0", fontSize: 14, width: "100%", outline: "none", boxSizing: "border-box" },
    modalOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, backdropFilter: "blur(4px)", padding: 16 },
    modal: { background: "#161921", border: "1px solid #252839", borderRadius: 16, padding: 24, width: "100%", maxWidth: 480, maxHeight: "92vh", overflowY: "auto" },
    row: { display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid #1a1d27" },
    tabBar: { display: "flex", background: "#12141c", borderTop: "1px solid #1e2130", position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50 },
  };

  const tabs = [["dashboard","📊","Dashboard"],["products","📦","Productos"],["movements","🔄","Historial"],
    ...(isAdmin ? [["users","👥","Usuarios"]] : [])];

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 28, height: 28, background: "#5b8def", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>📦</div>
          <span style={{ fontWeight: 600, fontSize: 14 }}>StockControl</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button style={S.btnPrimary} onClick={() => setModalType("scanner")}>📷 Escanear</button>
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#161921", border: "1px solid #252839", borderRadius: 9, padding: "6px 10px", cursor: "pointer" }}
            onClick={async () => { await signOut(token); setAuth(null); }}>
            <span style={{ fontSize: 12, color: "#8b90a8" }}>{userName}</span>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20, background: isAdmin ? "#1e2f50" : "#1a2f23", color: isAdmin ? "#5b8def" : "#4ade80" }}>{isAdmin ? "Admin" : "Operador"}</span>
            <span style={{ fontSize: 11, color: "#8b90a8" }}>↩</span>
          </div>
        </div>
      </div>

      <div style={{ padding: "18px 14px 90px", maxWidth: 1000, margin: "0 auto" }}>

        {view === "dashboard" && (
          <div>
            <h2 style={{ fontSize: 19, fontWeight: 700, marginBottom: 18 }}>Dashboard</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10, marginBottom: 18 }}>
              {[
                { label: "Productos", value: products.length, icon: "📦", color: "#5b8def" },
                { label: "Unidades", value: totalStock.toLocaleString(), icon: "🗃️", color: "#4ade80" },
                ...(isAdmin ? [{ label: "Valor total", value: `$${totalValue.toLocaleString("es-AR")}`, icon: "💰", color: "#f0c06b" }] : []),
                { label: "Alertas", value: alerts.length, icon: "⚠️", color: "#f0904a" },
              ].map(s => (
                <div key={s.label} style={{ background: "#161921", border: "1px solid #252839", borderRadius: 12, padding: "16px 18px" }}>
                  <div style={{ fontSize: 20, marginBottom: 5 }}>{s.icon}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: s.color, fontFamily: "monospace" }}>{s.value}</div>
                  <div style={{ fontSize: 12, color: "#8b90a8", marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>
            {alerts.length > 0 && (
              <div style={{ ...S.card, marginBottom: 18, border: "1px solid #3d2718" }}>
                <div style={{ fontSize: 13, fontWeight: 600, padding: "12px 16px", color: "#f0904a", borderBottom: "1px solid #3d2718" }}>⚠️ Stock bajo — {alerts.length} producto{alerts.length > 1 ? "s" : ""}</div>
                {alerts.map(p => (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 16px", borderBottom: "1px solid #1e2130" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: "#f0904a", fontFamily: "monospace" }}>{p.stock} / {p.min_stock} mín</div>
                    </div>
                    <button style={S.btnGhost} onClick={() => openMovement(p)}>+ Entrada</button>
                  </div>
                ))}
              </div>
            )}
            <div style={S.card}>
              <div style={{ fontSize: 13, fontWeight: 600, padding: "12px 16px", borderBottom: "1px solid #1e2130" }}>🔄 Últimos movimientos</div>
              {movements.slice(0, 8).map(m => (
                <div key={m.id} style={S.row}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: m.type === "entrada" ? "#1a2f23" : "#3d1f26", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>{m.type === "entrada" ? "⬇️" : "⬆️"}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.product_name}</div>
                    <div style={{ fontSize: 11, color: "#8b90a8" }}>{m.reason} · {m.user}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: m.type === "entrada" ? "#4ade80" : "#f06b7a" }}>{m.type === "entrada" ? "+" : "-"}{m.qty}</div>
                    <div style={{ fontSize: 10, color: "#8b90a8" }}>{formatDate(m.created_at)}</div>
                  </div>
                </div>
              ))}
              {movements.length === 0 && <div style={{ padding: 24, textAlign: "center", color: "#8b90a8", fontSize: 13 }}>Sin movimientos aún</div>}
            </div>
          </div>
        )}

        {view === "products" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h2 style={{ fontSize: 19, fontWeight: 700 }}>Productos</h2>
              {isAdmin && <button style={S.btnPrimary} onClick={openNewProduct}>+ Nuevo</button>}
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
              <input style={{ ...S.input, flex: 1, minWidth: 160 }} placeholder="🔍 Nombre o código..." value={search} onChange={e => setSearch(e.target.value)} />
              <select style={{ ...S.input, width: 150 }} value={filterCat} onChange={e => setFilterCat(e.target.value)}>
                <option value="Todas">Todas</option>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div style={S.card}>
              {filtered.length === 0 && <div style={{ padding: 24, textAlign: "center", color: "#8b90a8" }}>No se encontraron productos</div>}
              {filtered.map(p => (
                <div key={p.id} style={S.row}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                      {p.name}
                      {p.stock <= p.min_stock && <span style={{ background: "#3d2718", color: "#f0904a", fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 20 }}>⚠️</span>}
                    </div>
                    {p.barcode && <div style={{ fontSize: 11, color: "#8b90a8", fontFamily: "monospace" }}>{p.barcode}</div>}
                    <div style={{ fontSize: 12, marginTop: 2, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ color: "#7b9ef5" }}>{p.category}</span>
                      <span style={{ color: p.stock <= p.min_stock ? "#f0904a" : "#4ade80", fontFamily: "monospace", fontWeight: 700 }}>{p.stock} uds</span>
                      {isAdmin && <span style={{ color: "#8b90a8" }}>${Number(p.price).toLocaleString("es-AR")}</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 5 }}>
                    <button style={S.btnGhost} onClick={() => openMovement(p)}>🔄</button>
                    {isAdmin && <button style={S.btnGhost} onClick={() => openEditProduct(p)}>✏️</button>}
                    {isAdmin && <button style={S.btnDanger} onClick={() => deleteProduct(p.id)}>🗑️</button>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {view === "movements" && (
          <div>
            <h2 style={{ fontSize: 19, fontWeight: 700, marginBottom: 14 }}>Historial</h2>
            <div style={S.card}>
              {movements.length === 0 && <div style={{ padding: 24, textAlign: "center", color: "#8b90a8" }}>Sin movimientos</div>}
              {movements.map(m => (
                <div key={m.id} style={S.row}>
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: m.type === "entrada" ? "#1a2f23" : "#3d1f26", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>{m.type === "entrada" ? "⬇️" : "⬆️"}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.product_name}</div>
                    <div style={{ fontSize: 11, color: "#8b90a8" }}>{m.reason} · <span style={{ color: "#5b8def" }}>{m.user}</span></div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: m.type === "entrada" ? "#4ade80" : "#f06b7a" }}>{m.type === "entrada" ? "+" : "-"}{m.qty} uds</div>
                    <div style={{ fontSize: 10, color: "#8b90a8" }}>{formatDate(m.created_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {view === "users" && isAdmin && (
          <div>
            <h2 style={{ fontSize: 19, fontWeight: 700, marginBottom: 18 }}>Gestión de usuarios</h2>
            <div style={{ ...S.card, marginBottom: 20, padding: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: "#5b8def" }}>➕ Crear nuevo usuario</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: "#8b90a8", fontWeight: 500, display: "block", marginBottom: 5 }}>Email</label>
                  <input style={S.input} type="email" placeholder="usuario@email.com" value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "#8b90a8", fontWeight: 500, display: "block", marginBottom: 5 }}>Contraseña</label>
                  <input style={S.input} type="password" placeholder="Mínimo 6 caracteres" value={newUserPass} onChange={e => setNewUserPass(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "#8b90a8", fontWeight: 500, display: "block", marginBottom: 5 }}>Rol</label>
                  <div style={{ display: "flex", gap: 10 }}>
                    {["operador", "admin"].map(r => (
                      <button key={r} onClick={() => setNewUserRole(r)} style={{ flex: 1, padding: "10px", border: `2px solid ${newUserRole === r ? (r === "admin" ? "#5b8def" : "#4ade80") : "#252839"}`, borderRadius: 10, background: newUserRole === r ? (r === "admin" ? "#1e2f50" : "#1a2f23") : "#1e2130", color: newUserRole === r ? (r === "admin" ? "#5b8def" : "#4ade80") : "#8b90a8", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                        {r === "admin" ? "👑 Admin" : "👤 Operador"}
                      </button>
                    ))}
                  </div>
                </div>
                <button style={{ ...S.btnPrimary, padding: "11px", fontSize: 14, opacity: creatingUser ? 0.6 : 1 }} onClick={handleCreateUser} disabled={creatingUser}>
                  {creatingUser ? "Creando..." : "Crear usuario"}
                </button>
              </div>
            </div>
            <div style={S.card}>
              <div style={{ fontSize: 13, fontWeight: 600, padding: "12px 16px", borderBottom: "1px solid #1e2130" }}>👥 Usuarios ({users.length})</div>
              {users.map(u => (
                <div key={u.id} style={{ ...S.row, justifyContent: "space-between" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</div>
                    <div style={{ fontSize: 11, color: "#8b90a8", marginTop: 2 }}>{formatDate(u.created_at)}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 20, background: u.role === "admin" ? "#1e2f50" : "#1a2f23", color: u.role === "admin" ? "#5b8def" : "#4ade80" }}>
                      {u.role === "admin" ? "👑 Admin" : "👤 Operador"}
                    </span>
                    {u.id !== auth.session.user.id && (
                      <button style={S.btnGhost} onClick={() => changeUserRole(u.id, u.role === "admin" ? "operador" : "admin")}>🔄</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={S.tabBar}>
        {tabs.map(([v, icon, label]) => (
          <button key={v} onClick={() => setView(v)} style={{ flex: 1, background: "none", border: "none", cursor: "pointer", padding: "10px 4px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, color: view === v ? "#5b8def" : "#8b90a8", fontSize: 10, fontWeight: 500 }}>
            <span style={{ fontSize: 20 }}>{icon}</span>{label}
          </button>
        ))}
        <button onClick={() => setModalType("scanner")} style={{ flex: 1, background: "none", border: "none", cursor: "pointer", padding: "10px 4px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, color: "#8b90a8", fontSize: 10, fontWeight: 500 }}>
          <span style={{ fontSize: 20 }}>📷</span>Escanear
        </button>
      </div>

      {modalType === "scanner" && (
        <div style={S.modalOverlay} onClick={e => e.target === e.currentTarget && setModalType(null)}>
          <div style={S.modal}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>📷 Escanear código</div>
              <button style={S.btnGhost} onClick={() => setModalType(null)}>✕</button>
            </div>
            <BarcodeScanner onDetected={handleScanDetected} />
          </div>
        </div>
      )}

      {modalType === "product" && isAdmin && (
        <div style={S.modalOverlay} onClick={e => e.target === e.currentTarget && setModalType(null)}>
          <div style={S.modal}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{editProduct ? "Editar producto" : "Nuevo producto"}</div>
              <button style={S.btnGhost} onClick={() => setModalType(null)}>✕</button>
            </div>
            {[{label:"Nombre *",key:"name",type:"text",ph:"Ej: Cable HDMI 2m"},{label:"Código de barras",key:"barcode",type:"text",ph:"Ej: 7891234560001"},{label:"Descripción",key:"description",type:"text",ph:"Descripción breve"},{label:"Stock actual",key:"stock",type:"number",ph:"0"},{label:"Stock mínimo",key:"min_stock",type:"number",ph:"5"},{label:"Precio ($)",key:"price",type:"number",ph:"0"}].map(f => (
              <div key={f.key} style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: "#8b90a8", fontWeight: 500, display: "block", marginBottom: 5 }}>{f.label}</label>
                <input style={S.input} type={f.type} placeholder={f.ph} value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} />
              </div>
            ))}
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 12, color: "#8b90a8", fontWeight: 500, display: "block", marginBottom: 5 }}>Categoría</label>
              <select style={S.input} value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button style={S.btnGhost} onClick={() => setModalType(null)}>Cancelar</button>
              <button style={{ ...S.btnPrimary, opacity: saving ? 0.6 : 1 }} onClick={saveProduct} disabled={saving}>{saving ? "Guardando..." : editProduct ? "Guardar" : "Crear"}</button>
            </div>
          </div>
        </div>
      )}

      {modalType === "movement" && movProduct && (
        <div style={S.modalOverlay} onClick={e => e.target === e.currentTarget && setModalType(null)}>
          <div style={S.modal}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Registrar movimiento</div>
              <button style={S.btnGhost} onClick={() => setModalType(null)}>✕</button>
            </div>
            <div style={{ fontSize: 13, color: "#8b90a8", marginBottom: 16 }}>{movProduct.name} · Stock: <strong style={{ color: "#e8eaf0", fontFamily: "monospace" }}>{movProduct.stock}</strong></div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {["entrada","salida"].map(t => (
                <button key={t} onClick={() => setMovType(t)} style={{ flex: 1, padding: 11, border: `2px solid ${movType===t?(t==="entrada"?"#4ade80":"#f06b7a"):"#252839"}`, borderRadius: 10, background: movType===t?(t==="entrada"?"#1a2f23":"#3d1f26"):"#1e2130", color: movType===t?(t==="entrada"?"#4ade80":"#f06b7a"):"#8b90a8", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                  {t === "entrada" ? "⬇️ Entrada" : "⬆️ Salida"}
                </button>
              ))}
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: "#8b90a8", fontWeight: 500, display: "block", marginBottom: 5 }}>Cantidad</label>
              <input style={S.input} type="number" placeholder="1" value={movQty} onChange={e => setMovQty(e.target.value)} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: "#8b90a8", fontWeight: 500, display: "block", marginBottom: 5 }}>Motivo *</label>
              <input style={S.input} type="text" placeholder={movType === "entrada" ? "Ej: Compra proveedor" : "Ej: Venta"} value={movReason} onChange={e => setMovReason(e.target.value)} />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button style={S.btnGhost} onClick={() => setModalType(null)}>Cancelar</button>
              <button style={{ ...S.btnPrimary, opacity: saving ? 0.6 : 1 }} onClick={saveMovement} disabled={saving}>{saving ? "Guardando..." : "Confirmar"}</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: "fixed", bottom: 80, left: 16, right: 16, maxWidth: 360, margin: "0 auto", background: "#1e2130", border: `1px solid ${toast.type==="err"?"#5c2d38":"#1a3a28"}`, borderRadius: 12, padding: "13px 20px", fontSize: 14, fontWeight: 500, zIndex: 999, textAlign: "center", color: toast.type==="err"?"#f06b7a":"#4ade80" }}>
          {toast.type === "err" ? "❌" : "✅"} {toast.msg}
        </div>
      )}
    </div>
  );
}
