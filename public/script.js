/*************************************************
 * Utilidades de formato y semáforo
 *************************************************/
function formateaMoneda(n) {
  if (n == null) return "—";
  const v = Number(n);
  if (Number.isNaN(v)) return "—";
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(v);
}

function estadoChipByStock(stock, stockMin) {
  const s = Number(stock ?? 0);
  const min = (stockMin == null) ? 9 : Number(stockMin);
  if (s <= 2) return { cls: "bad", texto: "Crítico" };
  if (s <= min) return { cls: "warn", texto: "Bajo" };
  return { cls: "ok", texto: "OK" };
}

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/*************************************************
 * DASHBOARD: mostrar categorias criticas (nivel1)
 *************************************************/
async function renderDashboardSQL() {
  // KPIs
  try {
    const s = await getJSON("/api/dashboard/summary");
    const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setText("kpiStockTotal", Number(s.StockTotal ?? 0).toLocaleString("es-AR"));
    setText("kpiValorInventario", formateaMoneda(s.ValorInventario ?? 0));
    setText("kpiCriticos", Number(s.Criticos ?? 0).toLocaleString("es-AR"));
    setText("kpiMovRef", `${Math.max(5, Math.min(200, Math.round((s.StockTotal ?? 0)/50)))}`);
  } catch (e) {
    // console.warn("dashboard kpis err", e);
  }

  // Categorías críticas (nivel1)
  const contCats = document.getElementById("categoriasCriticas");
  const contProds = document.getElementById("productosDeCategoria");
  if (!contCats) return;

  contCats.innerHTML = `<div class="subtle">Cargando categorías con stock bajo…</div>`;
  try {
    const cats = await getJSON("/api/categorias/criticas");
    if (!Array.isArray(cats) || cats.length === 0) {
      contCats.innerHTML = `<div class="subtle">No hay categorías con productos en stock bajo.</div>`;
      if (contProds) contProds.innerHTML = "";
      return;
    }

    contCats.innerHTML = cats.map(c => {
      const chip = (c.MinStock <= 2) ? "bad" : "warn";
      return `<button class="btn" data-cat="${encodeURIComponent(c.Categoria)}">
                ${c.Categoria} <small style="margin-left:8px;opacity:.9">(${c.CantidadCriticos})</small>
                <span style="margin-left:8px" class="kpi-chip ${chip}"></span>
              </button>`;
    }).join("");

    contCats.onclick = (e) => {
      const b = e.target.closest("[data-cat]");
      if (!b) return;
      const cat = decodeURIComponent(b.getAttribute("data-cat"));
      pintarProductosDeCategoria(cat, contProds);
    };

    const first = contCats.querySelector("[data-cat]");
    if (first) {
      const cat = decodeURIComponent(first.getAttribute("data-cat"));
      pintarProductosDeCategoria(cat, contProds);
    }
  } catch (e) {
    contCats.innerHTML = `<div class="subtle">Error cargando categorías.</div>`;
    if (contProds) contProds.innerHTML = "";
    console.error(e);
  }
}

async function pintarProductosDeCategoria(cat, contProds) {
  if (!contProds) return;
  contProds.innerHTML = `<div class="card"><div class="subtle">Cargando productos de ${cat}…</div></div>`;
  try {
    const prods = await getJSON(`/api/categorias/${encodeURIComponent(cat)}/productos`);
    if (!Array.isArray(prods) || prods.length === 0) {
      contProds.innerHTML = `<div class="card"><div class="subtle">Sin productos en ${cat}.</div></div>`;
      return;
    }
    contProds.innerHTML = `
      <div class="card">
        <div class="section-title">Productos en categoría: ${cat}</div>
        <table class="table">
          <thead><tr><th>SKU</th><th>Producto</th><th>Stock</th><th>Precio</th><th>Estado</th></tr></thead>
          <tbody>
            ${prods.map(p => {
              const chip = estadoChipByStock(p.Stock, p.StockMinimo);
              return `<tr data-sku="${p.SKU}">
                        <td>${p.SKU}</td>
                        <td>${p.Nombre}</td>
                        <td>${p.Stock}</td>
                        <td>${formateaMoneda(p.Precio)}</td>
                        <td><span class="kpi-chip ${chip.cls}">${chip.texto}</span></td>
                      </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    `;
    const tbody = contProds.querySelector("tbody");
    if (tbody) {
      tbody.onclick = (e) => {
        const tr = e.target.closest("tr[data-sku]");
        if (!tr) return;
        const sku = tr.getAttribute("data-sku");
        window.location.href = `producto.html?sku=${encodeURIComponent(sku)}`;
      };
    }
  } catch (e) {
    contProds.innerHTML = `<div class="card"><div class="subtle">Error cargando productos de categoría.</div></div>`;
    console.error(e);
  }
}

/*************************************************
 * INVENTARIO – listado completo (SQL)
 * Soporta filtro: ?proveedor=ID
 *************************************************/
async function renderInventarioSQL() {
  const tbody = document.getElementById("tbodyInventario");
  if (!tbody) return;

  try {
    const params = new URLSearchParams(location.search);
    const proveedorFilter = params.get("proveedor");
    const url = proveedorFilter ? `/api/inventario?proveedor=${encodeURIComponent(proveedorFilter)}` : "/api/inventario";

    const data = await getJSON(url);
    if (!Array.isArray(data) || !data.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="subtle">Sin resultados.</td></tr>`;
      return;
    }
    let cache = data.slice();

    const pintar = (arr) => {
      if (!arr.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="subtle">Sin resultados.</td></tr>`;
        return;
      }
      tbody.innerHTML = arr.map(p => {
        const chip = estadoChipByStock(p.Stock, p.StockMinimo);
        return `
          <tr data-sku="${p.SKU}">
            <td>${p.SKU}</td>
            <td>${p.Nombre}</td>
            <td>${p.Categoria ?? "-"}</td>
            <td>${p.Stock}</td>
            <td>${formateaMoneda(p.Precio)}</td>
            <td><span class="kpi-chip ${chip.cls}">${chip.texto}</span></td>
          </tr>`;
      }).join("");
    };

    pintar(cache);

    tbody.onclick = (e) => {
      const tr = e.target.closest("tr[data-sku]");
      if (!tr) return;
      const sku = tr.getAttribute("data-sku");
      window.location.href = `producto.html?sku=${encodeURIComponent(sku)}`;
    };

    const input = document.getElementById("filtroInventario");
    if (input) {
      input.addEventListener("input", () => {
        const q = input.value.trim().toLowerCase();
        if (!q) return pintar(cache);
        const f = cache.filter(p =>
          (p.SKU || "").toLowerCase().includes(q) ||
          (p.Nombre || "").toLowerCase().includes(q)
        );
        pintar(f);
      });
    }
  } catch (e) {
    console.error("inventario error:", e);
    tbody.innerHTML = `<tr><td colspan="6" class="subtle">Error cargando inventario.</td></tr>`;
  }
}

/*************************************************
 * FICHA DE PRODUCTO – detalle (SQL, por SKU)
 *************************************************/
async function renderProductoSQL() {
  const cont = document.getElementById("producto-detalle");
  if (!cont) return;

  const params = new URLSearchParams(location.search);
  const sku = params.get("sku");
  if (!sku) {
    cont.innerHTML = `<div class="card"><p class="subtle">Error: Falta el parámetro de producto.</p></div>`;
    return;
  }

  try {
    const data = await getJSON(`/api/producto/${encodeURIComponent(sku)}`);
    const p = data.producto;
    const movs = data.movimientos || [];
    const chip = estadoChipByStock(p.Stock, p.StockMinimo);

    cont.innerHTML = `
      <div class="card">
        <h2 style="margin:0 0 6px">${p.Nombre}</h2>
        <div class="subtle">SKU: ${p.SKU} · Categoría: ${p.Categoria ?? "-"}</div>
        <p style="margin:10px 0 0"><strong>Stock:</strong> ${p.Stock} 
          <span class="kpi-chip ${chip.cls}" style="margin-left:8px">${chip.texto}</span>
        </p>
        <p><strong>Precio unitario:</strong> ${formateaMoneda(p.Precio)}</p>
        <div class="hstack" style="margin-top:10px; gap:10px">
          <button class="btn" id="btnGenerarReporte">Generar reporte</button>
          <a class="btn secondary" href="javascript:history.back()">Volver</a>
        </div>
      </div>

      <div class="card" style="margin-top:14px">
        <div class="section-title">Movimientos últimos 30 días</div>
        ${movs.length ? `
          <table class="table">
            <thead><tr><th>Día</th><th>Entradas</th><th>Salidas</th></tr></thead>
            <tbody>
              ${movs.map(m => `
                <tr>
                  <td>${m.Dia ?? "-"}</td>
                  <td>${m.Entradas ?? 0}</td>
                  <td>${m.Salidas ?? 0}</td>
                </tr>`).join("")}
            </tbody>
          </table>
        ` : `<div class="subtle">Sin movimientos en los últimos 30 días.</div>`}
      </div>
    `;

    const btnRep = document.getElementById("btnGenerarReporte");
    if (btnRep) {
      btnRep.onclick = () => {
        window.location.href = `generar-reporte.html?sku=${encodeURIComponent(p.SKU)}`;
      };
    }
  } catch (e) {
    cont.innerHTML = `<div class="card"><p class="subtle">Error: No existe el producto o no se pudo cargar.</p></div>`;
    console.error(e);
  }
}

/*************************************************
 * Reportes / Proveedores – reutilizable
 *************************************************/
async function renderReportesSQL() {
  const contCats = document.getElementById("categorias");
  const contTabla = document.getElementById("tabla-categoria");
  const params = new URLSearchParams(location.search);
  const sku = params.get("sku");

  if (sku && contTabla) {
    try {
      const data = await getJSON(`/api/producto/${encodeURIComponent(sku)}`);
      const p = data.producto;
      const movs = data.movimientos || [];
      const chip = estadoChipByStock(p.Stock, p.StockMinimo);
      contTabla.innerHTML = `
        <div class="card">
          <div class="section-title">Reporte puntual (SKU: ${p.SKU})</div>
          <p><strong>${p.Nombre}</strong> — ${p.Categoria ?? "-"} · Stock: ${p.Stock}
            <span class="kpi-chip ${chip.cls}" style="margin-left:8px">${chip.texto}</span>
          </p>
          <p>Precio: ${formateaMoneda(p.Precio)}</p>
        </div>
      `;
    } catch (e) {
      contTabla && (contTabla.innerHTML = `<div class="card"><div class="subtle">Error cargando reporte puntual.</div></div>`);
    }
  }

  if (contCats) {
    try {
      const cats = await getJSON("/api/categorias");
      contCats.innerHTML = cats.map(c => `<button class="btn" data-cat="${c.Categoria}">${c.Categoria} (${c.Cantidad})</button>`).join("");
      contCats.onclick = (e) => {
        const b = e.target.closest("[data-cat]");
        if (!b) return;
        const cat = b.getAttribute("data-cat");
        window.location.href = `reportes.html?categoria=${encodeURIComponent(cat)}`;
      };
    } catch {
      contCats && (contCats.innerHTML = `<span class="subtle">Error cargando categorías.</span>`);
    }
  }
}

/**************** PROVEEDORES ****************/
async function renderProveedores() {
  const cont = document.getElementById("proveedoresPageList") || document.getElementById("proveedoresList");
  if (!cont) return;
  cont.innerHTML = `<div class="subtle">Cargando proveedores…</div>`;
  try {
    const rows = await getJSON("/api/proveedores");
    if (!Array.isArray(rows) || rows.length === 0) {
      cont.innerHTML = `<div class="subtle">No hay proveedores registrados.</div>`;
      return;
    }

    // KPI básicos (si están en DOM)
    const kpiTotal = document.getElementById("kpiProvTotal");
    const kpiCrit = document.getElementById("kpiProvCrit");
    if (kpiTotal) kpiTotal.textContent = rows.length.toLocaleString("es-AR");
    const totalCrit = rows.reduce((acc, r) => acc + (Number(r.ProductosCriticos || 0)), 0);
    if (kpiCrit) kpiCrit.textContent = totalCrit.toLocaleString("es-AR");

    cont.innerHTML = `
      <table class="table">
        <thead><tr><th>Proveedor</th><th>Contacto</th><th>Productos</th><th>Crít.</th></tr></thead>
        <tbody>
          ${rows.map(r => `
            <tr data-prov="${r.IdProveedor}">
              <td>${r.Nombre}</td>
              <td>${r.Contacto ?? r.Email ?? r.Telefono ?? '-'}</td>
              <td style="text-align:center">${r.ProductosSuministrados ?? 0}</td>
              <td style="text-align:center"><span class="kpi-chip ${Number(r.ProductosCriticos)>0? 'warn' : 'ok'}">${r.ProductosCriticos}</span></td>
            </tr>`).join("")}
        </tbody>
      </table>
    `;

    // al click: redirigir a inventario filtrado
    const tbody = cont.querySelector("tbody");
    if (tbody) {
      tbody.onclick = (e) => {
        const tr = e.target.closest("tr[data-prov]");
        if (!tr) return;
        const id = tr.getAttribute("data-prov");
        window.location.href = `inventario.html?proveedor=${encodeURIComponent(id)}`;
      };
    }
  } catch (e) {
    cont.innerHTML = `<div class="subtle">Error cargando proveedores.</div>`;
    console.error(e);
  }
}

/**************** USUARIOS POR ROL ****************/
async function renderUsuariosPorRol() {
  const cont = document.getElementById("usuariosPorRol") || document.getElementById("usuariosPageList");
  if (!cont) return;
  cont.innerHTML = `<div class="subtle">Cargando…</div>`;
  try {
    const rows = await getJSON("/api/usuarios/por-rol");
    if (!Array.isArray(rows) || rows.length === 0) {
      cont.innerHTML = `<div class="subtle">No hay usuarios.</div>`;
      return;
    }
    // KPI (opcional)
    const kpiProdCat = document.getElementById("kpiProdCat");
    if (kpiProdCat) kpiProdCat.textContent = rows.reduce((acc, r) => acc + Number(r.Cantidad||0), 0).toLocaleString("es-AR");

    cont.innerHTML = `
      <ul style="list-style:none;padding:0;margin:0">
        ${rows.map(r => `<li style="margin:6px 0">${r.Rol ?? 'Sin rol'}: <strong>${r.Cantidad}</strong></li>`).join("")}
      </ul>
    `;
  } catch (e) {
    cont.innerHTML = `<div class="subtle">Error cargando usuarios.</div>`;
    console.error(e);
  }
}

/**************** PRECIOS RECIENTES ****************/
async function renderPreciosRecientes() {
  const cont = document.getElementById("preciosPageList") || document.getElementById("preciosRecientes");
  if (!cont) return;
  cont.innerHTML = `<div class="subtle">Cargando cambios de precio…</div>`;
  try {
    const rows = await getJSON("/api/precios/cambios-recientes");
    if (!Array.isArray(rows) || rows.length === 0) {
      cont.innerHTML = `<div class="subtle">No hay cambios recientes.</div>`;
      const kpi = document.getElementById("kpiPrecioCambios");
      if (kpi) kpi.textContent = "0";
      return;
    }

    const kpi = document.getElementById("kpiPrecioCambios");
    if (kpi) kpi.textContent = rows.length.toLocaleString("es-AR");

    cont.innerHTML = `
      <table class="table small">
        <thead><tr><th>Fecha</th><th>SKU</th><th>Producto</th><th>Precio</th><th>Usuario</th></tr></thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td>${r.FechaInicio}</td>
              <td>${r.SKU}</td>
              <td>${r.Producto}</td>
              <td>${formateaMoneda(r.Precio)}</td>
              <td>${r.Usuario ?? '-'}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    `;
  } catch (e) {
    cont.innerHTML = `<div class="subtle">Error cargando historial de precios.</div>`;
    console.error(e);
  }
}

/*************************************************
 * Bootstrap por página (inicialización)
 *************************************************/
document.addEventListener("DOMContentLoaded", () => {
  renderDashboardSQL();
  renderInventarioSQL();
  renderProductoSQL();
  renderReportesSQL();

  // nuevas entidades + secciones reutilizables
  renderProveedores();
  renderUsuariosPorRol();
  renderPreciosRecientes();
});
