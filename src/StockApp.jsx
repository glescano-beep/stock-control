import { useState, useEffect, useRef, useCallback } from "react";

// ─── SUPABASE CONFIG ────────────────────────────────────────────────────────
const SUPABASE_URL = "https://alikskdyvsaslpcpeytr.supabase.co";
const SUPABASE_KEY = "sb_publishable_ASahJWjMJ4cuqwmfuwiaqA_so5SxWxl";

async function sb(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: options.prefer || "return=representation",
    },
    ...options,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const api = {
  getProducts: () => sb("products?select=*&order=name.asc"),
  createProduct: (data) => sb("products", { method: "POST", body: JSON.stringify(data) }),
  updateProduct: (id, data) => sb(`products?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteProduct: (id) => sb(`products?id=eq.${id}`, { method: "DELETE", prefer: "return=minimal" }),
  getMovements: () => sb("movements?select=*&order=created_at.desc&limit=200"),
  createMovement: (data) => sb("movements", { method: "POST", body: JSON.stringify(data) }),
};

const CATEGORIES = ["Electrónica", "Alimentos", "Ropa", "Herramientas", "Limpieza", "Oficina", "Otro"];

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ─── BARCODE SCANNER COMPONENT ───────────────────────────────────────────────
function BarcodeScanner({ onDetected, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const animRef = useRef(null);
  const [error, setError] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [manualCode, setManualCode] = useState("");

  useEffect(() => {
    let barcodeDetector;
    async function startCamera() {
      try {
        if (!("BarcodeDetector" in window)) {
          setError("Tu navegador no soporta escáner automático. Usá el campo manual abajo.");
          return;
        }
        barcodeDetector = new window.BarcodeDetector({ formats: ["ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e", "qr_code"] });
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } } });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setScanning(true);
          detect();
        }
      } catch (e) {
        setError("No se pudo acceder a la cámara. Usá el campo manual abajo.");
      }
    }

    async function detect() {
      if (!videoRef.current || !barcodeDetector) return;
      try {
        const codes = await barcodeDetector.detect(videoRef.current);
        if (codes.length > 0) {
          onDetected(codes[0].rawValue);
          return;
        }
      } catch {}
      animRef.current = requestAnimationFrame(detect);
    }

    startCamera();
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", background: "#0a0c12", aspectRatio: "4/3" }}>
        <video ref={videoRef} style={{ width: "100%", height: "100%", objectFit: "cover" }} playsInline muted />
        {scanning && (
          <>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
              <div style={{ width: "75%", height: "30%", border: "2px solid #5b8def", borderRadius: 8, boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)" }} />
            </div>
            <div style={{ position: "absolute", bottom: 12, left: 0, right: 0, textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
              Apuntá al código de barras
            </div>
          </>
        )}
        {error && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, textAlign: "center", fontSize: 13, color: "#f0904a" }}>
            {error}
          </div>
        )}
      </div>
      <div>
        <label style={{ fontSize: 12, color: "#8b90a8", fontWeight: 500, display: "block", marginBottom: 6 }}>O ingresá el código manualmente:</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            style={{ flex: 1, background: "#1e2130", border: "1px solid #252839", borderRadius: 9, padding: "10px 14px", color: "#e8eaf0", fontSize: 15, fontFamily: "'DM Mono', monospace", outline: "none" }}
            placeholder="Ej: 7891234560001"
            value={manualCode}
            onChange={e => setManualCode(e.target.value)}
            onKeyDown={e => e.key === "Enter" && manualCode.trim() && onDetected(manualCode.trim())}
            autoFocus={!!error}
          />
          <button
            onClick={() => manualCode.trim() && onDetected(manualCode.trim())}
            style={{ background: "#5b8def", color: "#fff", border: "none", borderRadius: 9, padding: "10px 18px", fontWeight: 600, fontSize: 14, cursor: "pointer" }}
          >
            Buscar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN APP ────────────────────────────────────────────────────────────────
export default function StockApp() {
  const [view, setView] = useState("dashboard");
  const [products, setProducts] = useState([]);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("Todas");
  const [modalType, setModalType] = useState(null);
  const [editProduct, setEditProduct] = useState(null);
  const [movProduct, setMovProduct] = useState(null);
  const [movQty, setMovQty] = useState(1);
  const [movType, setMovType] = useState("entrada");
  const [movReason, setMovReason] = useState("");
  const [movUser, setMovUser] = useState("Admin");
  const [toast, setToast] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", barcode: "", category: "Otro", description: "", stock: 0, min_stock: 5, price: 0 });

  const showToast = (msg, type = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadAll = useCallback(async () => {
    try {
      const [prods, movs] = await Promise.all([api.getProducts(), api.getMovements()]);
      setProducts(prods || []);
      setMovements(movs || []);
    } catch (e) {
      showToast("Error conectando con la base de datos", "err");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const alerts = products.filter(p => p.stock <= p.min_stock);
  const totalStock = products.reduce((a, b) => a + (b.stock || 0), 0);
  const totalValue = products.reduce((a, b) => a + (b.stock || 0) * (b.price || 0), 0);

  const openNewProduct = () => {
    setEditProduct(null);
    setForm({ name: "", barcode: "", category: "Otro", description: "", stock: 0, min_stock: 5, price: 0 });
    setModalType("product");
  };

  const openEditProduct = (p) => {
    setEditProduct(p);
    setForm({ name: p.name, barcode: p.barcode || "", category: p.category || "Otro", description: p.description || "", stock: p.stock, min_stock: p.min_stock, price: p.price });
    setModalType("product");
  };

  const saveProduct = async () => {
    if (!form.name.trim()) return showToast("El nombre es requerido", "err");
    setSaving(true);
    try {
      const data = { ...form, stock: Number(form.stock), min_stock: Number(form.min_stock), price: Number(form.price) };
      if (editProduct) {
        await api.updateProduct(editProduct.id, data);
        showToast("Producto actualizado ✓");
      } else {
        await api.createProduct(data);
        showToast("Producto creado ✓");
      }
      await loadAll();
      setModalType(null);
    } catch (e) {
      showToast("Error al guardar", "err");
    } finally {
      setSaving(false);
    }
  };

  const deleteProduct = async (id) => {
    if (!confirm("¿Eliminar este producto?")) return;
    try {
      await api.deleteProduct(id);
      showToast("Producto eliminado");
      await loadAll();
    } catch {
      showToast("Error al eliminar", "err");
    }
  };

  const openMovement = (p) => {
    setMovProduct(p);
    setMovQty(1);
    setMovType("entrada");
    setMovReason("");
    setModalType("movement");
  };

  const saveMovement = async () => {
    if (!movReason.trim()) return showToast("Ingresá el motivo", "err");
    const qty = Number(movQty);
    if (qty <= 0) return showToast("Cantidad inválida", "err");
    if (movType === "salida" && movProduct.stock < qty) return showToast("Stock insuficiente", "err");
    setSaving(true);
    try {
      const newStock = movType === "entrada" ? movProduct.stock + qty : movProduct.stock - qty;
      await api.updateProduct(movProduct.id, { stock: newStock });
      await api.createMovement({
        product_id: movProduct.id,
        product_name: movProduct.name,
        type: movType,
        qty,
        reason: movReason,
        user: movUser,
      });
      showToast(`${movType === "entrada" ? "Entrada" : "Salida"} registrada ✓`);
      await loadAll();
      setModalType(null);
    } catch {
      showToast("Error al registrar movimiento", "err");
    } finally {
      setSaving(false);
    }
  };

  const handleScanDetected = (code) => {
    const found = products.find(p => p.barcode === code.trim());
    if (found) {
      setModalType(null);
      setTimeout(() => openMovement(found), 200);
    } else {
      showToast(`Código "${code}" no encontrado`, "err");
      setModalType(null);
      setTimeout(() => {
        setForm(f => ({ ...f, barcode: code }));
        openNewProduct();
      }, 300);
    }
  };

  const filtered = products.filter(p => {
    const s = search.toLowerCase();
    const matchSearch = p.name?.toLowerCase().includes(s) || p.barcode?.includes(s);
    const matchCat = filterCat === "Todas" || p.category === filterCat;
    return matchSearch && matchCat;
  });

  if (loading) return (
    <div style={{ background: "#0f1117", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16, fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ width: 44, height: 44, border: "3px solid #1e2130", borderTop: "3px solid #5b8def", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <div style={{ color: "#8b90a8", fontSize: 14 }}>Conectando con la base de datos...</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return (
    <div style={{ fontFamily: "'DM Sans', 'Segoe UI', sans-serif", background: "#0f1117", minHeight: "100vh", color: "#e8eaf0" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: #1a1d27; } ::-webkit-scrollbar-thumb { background: #3a3d52; border-radius: 2px; }
        input, select, textarea, button { font-family: inherit; }
        .nav-btn { background: none; border: none; cursor: pointer; padding: 10px 16px; border-radius: 8px; color: #8b90a8; font-size: 13px; font-weight: 500; transition: all 0.15s; display: flex; align-items: center; gap: 6px; white-space: nowrap; }
        .nav-btn:hover { background: #1e2130; color: #e8eaf0; }
        .nav-btn.active { background: #1e2130; color: #5b8def; }
        .card { background: #161921; border: 1px solid #252839; border-radius: 14px; padding: 20px; }
        .btn-primary { background: #5b8def; color: #fff; border: none; border-radius: 9px; padding: 10px 20px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.15s; white-space: nowrap; }
        .btn-primary:hover:not(:disabled) { background: #4a7be0; transform: translateY(-1px); }
        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-ghost { background: #1e2130; color: #8b90a8; border: 1px solid #252839; border-radius: 9px; padding: 9px 14px; font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.15s; }
        .btn-ghost:hover { background: #252839; color: #e8eaf0; }
        .btn-danger { background: #3d1f26; color: #f06b7a; border: 1px solid #5c2d38; border-radius: 9px; padding: 8px 12px; font-size: 13px; cursor: pointer; transition: all 0.15s; }
        .btn-danger:hover { background: #4d2530; }
        .input-field { background: #1e2130; border: 1px solid #252839; border-radius: 9px; padding: 10px 14px; color: #e8eaf0; font-size: 14px; width: 100%; outline: none; transition: border 0.15s; }
        .input-field:focus { border-color: #5b8def; }
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.75); display: flex; align-items: center; justify-content: center; z-index: 100; backdrop-filter: blur(4px); padding: 16px; }
        .modal { background: #161921; border: 1px solid #252839; border-radius: 16px; padding: 24px; width: 100%; max-width: 480px; max-height: 92vh; overflow-y: auto; }
        .mov-row { display: flex; align-items: center; gap: 12px; padding: 14px 18px; border-bottom: 1px solid #1a1d27; transition: background 0.1s; }
        .mov-row:hover { background: #1a1d27; }
        .toast { position: fixed; bottom: 24px; right: 24px; left: 24px; max-width: 360px; margin: 0 auto; background: #1e2130; border: 1px solid #252839; border-radius: 12px; padding: 13px 20px; font-size: 14px; font-weight: 500; z-index: 999; animation: slideup 0.2s ease; box-shadow: 0 8px 32px rgba(0,0,0,0.5); text-align: center; }
        @keyframes slideup { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .product-row { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 12px; padding: 14px 16px; border-bottom: 1px solid #1a1d27; transition: background 0.1s; }
        .product-row:hover { background: #1a1d27; }
        .product-row-desktop { grid-template-columns: 1fr 110px 100px 90px auto; }
        @media (min-width: 640px) { .product-row { grid-template-columns: 1fr 110px 100px 90px auto; } .hide-mobile { display: flex !important; } }
        .hide-mobile { display: none; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .stat-card { background: #161921; border: 1px solid #252839; border-radius: 14px; padding: 20px 22px; }
        .tab-bar { display: flex; background: #12141c; border-top: 1px solid #1e2130; position: fixed; bottom: 0; left: 0; right: 0; z-index: 50; padding-bottom: env(safe-area-inset-bottom); }
        .tab-btn { flex: 1; background: none; border: none; cursor: pointer; padding: 12px 8px 10px; display: flex; flex-direction: column; align-items: center; gap: 3px; color: #8b90a8; font-size: 10px; font-weight: 500; transition: color 0.15s; }
        .tab-btn.active { color: #5b8def; }
        .tab-btn span { font-size: 20px; line-height: 1; }
      `}</style>

      {/* Header */}
      <div style={{ background: "#12141c", borderBottom: "1px solid #1e2130", padding: "0 16px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 58, position: "sticky", top: 0, zIndex: 40 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{ width: 30, height: 30, background: "#5b8def", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>📦</div>
          <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 500, fontSize: 15, color: "#e8eaf0" }}>StockControl</span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {[["dashboard", "📊", "Dashboard"], ["products", "📦", "Productos"], ["movements", "🔄", "Historial"]].map(([v, icon, label]) => (
            <button key={v} className={`nav-btn ${view === v ? "active" : ""} hide-mobile`} onClick={() => setView(v)}>{icon} {label}</button>
          ))}
        </div>
        <button className="btn-primary" style={{ fontSize: 13, padding: "8px 14px" }} onClick={() => setModalType("scanner")}>
          📷 Escanear
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: "20px 16px 90px", maxWidth: 1000, margin: "0 auto" }}>

        {/* DASHBOARD */}
        {view === "dashboard" && (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>Dashboard</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 20 }}>
              {[
                { label: "Productos", value: products.length, icon: "📦", color: "#5b8def" },
                { label: "Unidades", value: totalStock.toLocaleString(), icon: "🗃️", color: "#4ade80" },
                { label: "Valor total", value: `$${totalValue.toLocaleString("es-AR")}`, icon: "💰", color: "#f0c06b" },
                { label: "Alertas", value: alerts.length, icon: "⚠️", color: "#f0904a" },
              ].map(s => (
                <div key={s.label} className="stat-card">
                  <div style={{ fontSize: 22, marginBottom: 6 }}>{s.icon}</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: s.color, fontFamily: "'DM Mono', monospace" }}>{s.value}</div>
                  <div style={{ fontSize: 12, color: "#8b90a8", marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {alerts.length > 0 && (
              <div className="card" style={{ marginBottom: 20, border: "1px solid #3d2718", padding: 0, overflow: "hidden" }}>
                <div style={{ fontSize: 14, fontWeight: 600, padding: "14px 16px", color: "#f0904a", borderBottom: "1px solid #3d2718" }}>⚠️ Stock bajo — {alerts.length} producto{alerts.length > 1 ? "s" : ""}</div>
                {alerts.map(p => (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid #1e2130" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: "#f0904a", fontFamily: "'DM Mono', monospace" }}>{p.stock} uds · mín {p.min_stock}</div>
                    </div>
                    <button className="btn-ghost" style={{ fontSize: 12, padding: "6px 12px" }} onClick={() => openMovement(p)}>+ Entrada</button>
                  </div>
                ))}
              </div>
            )}

            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ fontSize: 14, fontWeight: 600, padding: "14px 16px", borderBottom: "1px solid #1e2130" }}>🔄 Últimos movimientos</div>
              {movements.slice(0, 8).map(m => (
                <div key={m.id} className="mov-row">
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: m.type === "entrada" ? "#1a2f23" : "#3d1f26", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>
                    {m.type === "entrada" ? "⬇️" : "⬆️"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.product_name}</div>
                    <div style={{ fontSize: 11, color: "#8b90a8", marginTop: 1 }}>{m.reason} · {m.user}</div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, color: m.type === "entrada" ? "#4ade80" : "#f06b7a", fontWeight: 700 }}>
                      {m.type === "entrada" ? "+" : "-"}{m.qty}
                    </div>
                    <div style={{ fontSize: 10, color: "#8b90a8" }}>{formatDate(m.created_at)}</div>
                  </div>
                </div>
              ))}
              {movements.length === 0 && <div style={{ padding: 28, textAlign: "center", color: "#8b90a8", fontSize: 13 }}>Sin movimientos aún</div>}
            </div>
          </div>
        )}

        {/* PRODUCTS */}
        {view === "products" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700 }}>Productos</h2>
              <button className="btn-primary" style={{ fontSize: 13, padding: "8px 14px" }} onClick={openNewProduct}>+ Nuevo</button>
            </div>
            <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
              <input className="input-field" style={{ flex: 1, minWidth: 180 }} placeholder="🔍 Nombre o código..." value={search} onChange={e => setSearch(e.target.value)} />
              <select className="input-field" style={{ width: 160 }} value={filterCat} onChange={e => setFilterCat(e.target.value)}>
                <option value="Todas">Todas</option>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>

            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              {filtered.length === 0 && <div style={{ padding: 28, textAlign: "center", color: "#8b90a8", fontSize: 13 }}>No se encontraron productos</div>}
              {filtered.map(p => (
                <div key={p.id} className="product-row">
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      {p.name}
                      {p.stock <= p.min_stock && <span style={{ background: "#3d2718", color: "#f0904a", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20 }}>⚠️ Bajo</span>}
                    </div>
                    {p.barcode && <div style={{ fontSize: 11, color: "#8b90a8", fontFamily: "'DM Mono', monospace", marginTop: 2 }}>{p.barcode}</div>}
                    <div style={{ fontSize: 12, color: "#6b7094", marginTop: 2, display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ color: "#7b9ef5" }}>{p.category}</span>
                      <span style={{ color: p.stock <= p.min_stock ? "#f0904a" : "#4ade80", fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>{p.stock} uds</span>
                      <span>${Number(p.price).toLocaleString("es-AR")}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button className="btn-ghost" style={{ padding: "7px 11px", fontSize: 14 }} onClick={() => openMovement(p)} title="Movimiento">🔄</button>
                    <button className="btn-ghost" style={{ padding: "7px 11px", fontSize: 14 }} onClick={() => openEditProduct(p)} title="Editar">✏️</button>
                    <button className="btn-danger" style={{ padding: "7px 10px", fontSize: 14 }} onClick={() => deleteProduct(p.id)} title="Eliminar">🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* MOVEMENTS */}
        {view === "movements" && (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Historial de movimientos</h2>
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              {movements.length === 0 && <div style={{ padding: 28, textAlign: "center", color: "#8b90a8", fontSize: 13 }}>Sin movimientos aún</div>}
              {movements.map(m => (
                <div key={m.id} className="mov-row">
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: m.type === "entrada" ? "#1a2f23" : "#3d1f26", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>
                    {m.type === "entrada" ? "⬇️" : "⬆️"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.product_name}</div>
                    <div style={{ fontSize: 11, color: "#8b90a8", marginTop: 1 }}>{m.reason} · <span style={{ color: "#5b8def" }}>{m.user}</span></div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, fontWeight: 700, color: m.type === "entrada" ? "#4ade80" : "#f06b7a" }}>
                      {m.type === "entrada" ? "+" : "-"}{m.qty} uds
                    </div>
                    <div style={{ fontSize: 10, color: "#8b90a8", marginTop: 2 }}>{formatDate(m.created_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom tab bar (mobile) */}
      <div className="tab-bar">
        {[["dashboard", "📊", "Dashboard"], ["products", "📦", "Productos"], ["movements", "🔄", "Historial"]].map(([v, icon, label]) => (
          <button key={v} className={`tab-btn ${view === v ? "active" : ""}`} onClick={() => setView(v)}>
            <span>{icon}</span>{label}
          </button>
        ))}
        <button className="tab-btn" onClick={() => setModalType("scanner")}>
          <span>📷</span>Escanear
        </button>
      </div>

      {/* MODAL: Scanner */}
      {modalType === "scanner" && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModalType(null)}>
          <div className="modal">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 17, fontWeight: 700 }}>📷 Escanear código</div>
              <button className="btn-ghost" style={{ padding: "5px 10px", fontSize: 18 }} onClick={() => setModalType(null)}>✕</button>
            </div>
            <BarcodeScanner onDetected={handleScanDetected} onClose={() => setModalType(null)} />
          </div>
        </div>
      )}

      {/* MODAL: Product */}
      {modalType === "product" && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModalType(null)}>
          <div className="modal">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 17, fontWeight: 700 }}>{editProduct ? "Editar producto" : "Nuevo producto"}</div>
              <button className="btn-ghost" style={{ padding: "5px 10px", fontSize: 18 }} onClick={() => setModalType(null)}>✕</button>
            </div>
            {[
              { label: "Nombre *", key: "name", type: "text", ph: "Ej: Cable HDMI 2m" },
              { label: "Código de barras", key: "barcode", type: "text", ph: "Ej: 7891234560001" },
              { label: "Descripción", key: "description", type: "text", ph: "Descripción breve" },
              { label: "Stock actual", key: "stock", type: "number", ph: "0" },
              { label: "Stock mínimo (alerta)", key: "min_stock", type: "number", ph: "5" },
              { label: "Precio ($)", key: "price", type: "number", ph: "0" },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: 13 }}>
                <label style={{ fontSize: 12, color: "#8b90a8", fontWeight: 500, display: "block", marginBottom: 5 }}>{f.label}</label>
                <input className="input-field" type={f.type} placeholder={f.ph} value={form[f.key]} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} />
              </div>
            ))}
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 12, color: "#8b90a8", fontWeight: 500, display: "block", marginBottom: 5 }}>Categoría</label>
              <select className="input-field" value={form.category} onChange={e => setForm(prev => ({ ...prev, category: e.target.value }))}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="btn-ghost" onClick={() => setModalType(null)}>Cancelar</button>
              <button className="btn-primary" onClick={saveProduct} disabled={saving}>{saving ? "Guardando..." : editProduct ? "Guardar" : "Crear producto"}</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Movement */}
      {modalType === "movement" && movProduct && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModalType(null)}>
          <div className="modal">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <div style={{ fontSize: 17, fontWeight: 700 }}>Registrar movimiento</div>
              <button className="btn-ghost" style={{ padding: "5px 10px", fontSize: 18 }} onClick={() => setModalType(null)}>✕</button>
            </div>
            <div style={{ fontSize: 13, color: "#8b90a8", marginBottom: 18 }}>
              {movProduct.name} · Stock: <span style={{ color: "#e8eaf0", fontWeight: 700, fontFamily: "'DM Mono', monospace" }}>{movProduct.stock}</span>
            </div>
            <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
              {["entrada", "salida"].map(t => (
                <button key={t} onClick={() => setMovType(t)} style={{ flex: 1, padding: "12px", border: `2px solid ${movType === t ? (t === "entrada" ? "#4ade80" : "#f06b7a") : "#252839"}`, borderRadius: 10, background: movType === t ? (t === "entrada" ? "#1a2f23" : "#3d1f26") : "#1e2130", color: movType === t ? (t === "entrada" ? "#4ade80" : "#f06b7a") : "#8b90a8", fontWeight: 700, fontSize: 14, cursor: "pointer", transition: "all 0.15s" }}>
                  {t === "entrada" ? "⬇️ Entrada" : "⬆️ Salida"}
                </button>
              ))}
            </div>
            {[
              { label: "Cantidad", val: movQty, set: setMovQty, type: "number", ph: "1" },
              { label: "Motivo *", val: movReason, set: setMovReason, type: "text", ph: movType === "entrada" ? "Ej: Compra proveedor" : "Ej: Venta, uso interno" },
              { label: "Usuario", val: movUser, set: setMovUser, type: "text", ph: "Nombre del responsable" },
            ].map(f => (
              <div key={f.label} style={{ marginBottom: 13 }}>
                <label style={{ fontSize: 12, color: "#8b90a8", fontWeight: 500, display: "block", marginBottom: 5 }}>{f.label}</label>
                <input className="input-field" type={f.type} placeholder={f.ph} value={f.val} onChange={e => f.set(e.target.value)} />
              </div>
            ))}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
              <button className="btn-ghost" onClick={() => setModalType(null)}>Cancelar</button>
              <button className="btn-primary" onClick={saveMovement} disabled={saving}>{saving ? "Guardando..." : "Confirmar"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="toast" style={{ borderColor: toast.type === "err" ? "#5c2d38" : "#1a3a28", color: toast.type === "err" ? "#f06b7a" : "#4ade80" }}>
          {toast.type === "err" ? "❌" : "✅"} {toast.msg}
        </div>
      )}
    </div>
  );
}
