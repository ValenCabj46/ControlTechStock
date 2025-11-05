/*************************************************
 * Utilidades de formato y semáforo
 *************************************************/
function formateaMoneda(n) {
  if (n == null) return "—";
  const v = Number(n);
  if (Number.isNaN(v)) return "—";
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(v);
}

function estadoChip(stock) {
  const s = Number(stock ?? 0);
  if (s <= 2) return { cls: "bad", texto: "Crítico" };
  if (s <= 9) return { cls: "warn", texto: "Bajo" };
  return { cls: "ok", texto: "OK" };
}

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/*************************************************
 * DASHBOARD – KPIs + Críticos (SQL) con fallback
 *************************************************/
async function renderDashboardSQL() {
  const elTotal = document.getElementById("kpiStockTotal");
  const elVal   = document.getElementById("kpiValorInventario");
  const elCrit  = document.getElementById("kpiCriticos");
  const elMovRef= document.getElementById("kpiMovRef");
  const tbody   = document.getElementById("tbodyCriticos");

  // KPIs
  if (elTotal || elVal || elCrit) {
    try {
      const s = await getJSON("/api/dashboard/summary");
      elTotal && (elTotal.textContent = Number(s.StockTotal ?? 0).toLocaleString("es-AR"));
      elVal   && (elVal.textContent   = formateaMoneda(s.ValorInventario ?? 0));
      elCrit  && (elCrit.textContent  = Number(s.Criticos ?? 0).toLocaleString("es-AR"));
      elMovRef && (elMovRef.textContent = `${Math.max(5, Math.min(200, Math.round((s.StockTotal ?? 0)/50)))}`);
    } catch {
      // Si falla, dejamos los valores que ya tenía el HTML
    }
  }

  // Tabla de críticos (solo si existe el tbody)
  if (tbody) {
    try {
      const criticos = await getJSON("/api/productos/criticos");
      if (Array.isArray(criticos) && criticos.length) {
        tbody.innerHTML = criticos.map(p => {
          const chip = estadoChip(p.StockActual ?? p.Stock);
          return `
            <tr data-sku="${p.SKU}">
              <td>${p.SKU}</td>
              <td>${p.Nombre}</td>
              <td>${p.Categoria ?? "-"}</td>
              <td>${p.StockActual ?? p.Stock ?? 0}</td>
              <td><span class="kpi-chip ${chip.cls}">${chip.texto}</span></td>
            </tr>`;
        }).join("");
        tbody.onclick = (e) => {
          const tr = e.target.closest("tr[data-sku]");
          if (!tr) return;
          const sku = tr.getAttribute("data-sku");
          window.location.href = `producto.html?sku=${encodeURIComponent(sku)}`;
        };
      } else {
        // si no hay datos, mostramos un renglón informativo
        tbody.innerHTML = `<tr><td colspan="5" class="subtle">No hay productos críticos.</td></tr>`;
      }
    } catch {
      // si falla, no tocamos lo que había en el HTML
    }
  }
}

/*************************************************
 * INVENTARIO – listado completo (SQL) con fallback
 *************************************************/
async function renderInventarioSQL() {
  const tbody = document.getElementById("tbodyInventario");
  if (!tbody) return;

  try {
    const data = await getJSON("/api/inventario");
    if (!Array.isArray(data) || !data.length) return; // no pisamos la tabla si vino vacío

    let cache = data.slice();

    const pintar = (arr) => {
      if (!arr.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="subtle">Sin resultados.</td></tr>`;
        return;
      }
      tbody.innerHTML = arr.map(p => {
        const chip = estadoChip(p.Stock);
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
  } catch {
    // si falla, dejamos el contenido estático del HTML
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
    const chip = estadoChip(p.Stock);

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
                  <td>${m.Dia?.substring(0,10) ?? "-"}</td>
                  <td>${m.Entradas ?? 0}</td>
                  <td>${m.Salidas ?? 0}</td>
                </tr>`).join("")}
            </tbody>
          </table>
        ` : `<div class="subtle">Sin movimientos en los últimos 30 días.</div>`}
      </div>
    `;

    // Drill nivel 3
    const btnRep = document.getElementById("btnGenerarReporte");
    if (btnRep) {
      btnRep.onclick = () => {
        window.location.href = `reportes.html?sku=${encodeURIComponent(p.SKU)}`;
      };
    }
  } catch {
    cont.innerHTML = `
      <div class="card"><p class="subtle">Error: No existe el producto o no se pudo cargar.</p></div>`;
  }
}

/*************************************************
 * REPORTES – categorías + productos de categoría + reporte puntual
 *************************************************/
async function renderReportesSQL() {
  const contCats = document.getElementById("categorias");
  const contTabla = document.getElementById("tabla-categoria");

  // KPIs simples (opcionales): total productos, % bajo stock, etc.
  (async () => {
    try {
      const s = await getJSON("/api/dashboard/summary");
      const k1 = document.getElementById("kpiTotalCat");
      const k2 = document.getElementById("kpiCatAct");
      const k3 = document.getElementById("kpiPctBajo");
      k1 && (k1.textContent = Number(s.StockTotal ?? 0).toLocaleString("es-AR"));
      k2 && (k2.textContent = "—"); // si no tenés endpoint, dejalo así
      if (k3) {
        const total = Number(s.StockTotal ?? 0);
        const crit  = Number(s.Criticos ?? 0);
        const pct = total > 0 ? Math.round((crit/Math.max(1,total))*100) : 0;
        k3.textContent = `${pct}%`;
      }
    } catch {/* ignore */}
  })();

  // reporte puntual por SKU (si viene ?sku=...)
const params = new URLSearchParams(location.search);
const sku = params.get("sku");
if (sku && contTabla) {
  try {
    const data = await getJSON(`/api/producto/${encodeURIComponent(sku)}`);
    const p = data.producto;
    const movs = data.movimientos || [];
    const chip = estadoChip(p.Stock);

    contTabla.innerHTML = `
      <div class="card">
        <div class="section-title">Reporte puntual (SKU: ${p.SKU})</div>
        <p><strong>${p.Nombre}</strong> — ${p.Categoria ?? "-"} · Stock: ${p.Stock}
          <span class="kpi-chip ${chip.cls}" style="margin-left:8px">${chip.texto}</span>
        </p>
        <p>Precio: ${formateaMoneda(p.Precio)}</p>

        <div class="subtle" style="margin:10px 0">Movimientos 30 días</div>
        ${movs.length ? `
          <table class="table">
            <thead><tr><th>Día</th><th>Entradas</th><th>Salidas</th></tr></thead>
            <tbody>
              ${movs.map(m => `
                <tr>
                  <td>${m.Dia?.substring(0,10) ?? "-"}</td>
                  <td>${m.Entradas ?? 0}</td>
                  <td>${m.Salidas ?? 0}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        ` : `<div class="subtle">Sin movimientos en los últimos 30 días.</div>`}
      </div>

      <!-- 🔽 NUEVO: menú de generación -->
      <div class="card" style="margin-top:14px">
        <div class="section-title">Generar reporte</div>
        <div class="hstack" style="gap:10px; align-items:end; flex-wrap:wrap">
          <div>
            <div class="subtle">Desde</div>
            <input id="repDesde" type="date" class="input">
          </div>
          <div>
            <div class="subtle">Hasta</div>
            <input id="repHasta" type="date" class="input">
          </div>
          <div>
            <div class="subtle">Formato</div>
            <select id="repFormato" class="input">
              <option>PDF</option>
              <option>CSV</option>
              <option>XLSX</option>
            </select>
          </div>
          <button id="btnGenerarReporteSKU" class="btn">Generar</button>
          <a class="btn secondary" href="producto.html?sku=${encodeURIComponent(p.SKU)}">Volver a la ficha</a>
        </div>
      </div>
    `;

    // Acción del botón (mock de 2da entrega)
    const btn = document.getElementById("btnGenerarReporteSKU");
    if (btn) {
      btn.onclick = () => {
        const desde = document.getElementById("repDesde")?.value || "(sin fecha)";
        const hasta = document.getElementById("repHasta")?.value || "(sin fecha)";
        const fmt   = document.getElementById("repFormato")?.value || "PDF";
        // Para la segunda entrega sirve como demostración:
        alert(`(Demo) Generando reporte de ${p.Nombre}\nSKU: ${p.SKU}\nDesde: ${desde}\nHasta: ${hasta}\nFormato: ${fmt}`);
        // Si luego querés una página aparte, podés redirigir:
        // window.location.href = `generar-reporte.html?sku=${encodeURIComponent(p.SKU)}&desde=${desde}&hasta=${hasta}&fmt=${fmt}`;
      };
    }
  } catch {
    contTabla.innerHTML = `<div class="card"><div class="subtle">Error cargando reporte por SKU.</div></div>`;
  }
}


  // categorías → chips
  if (contCats) {
    try {
      const cats = await getJSON("/api/categorias"); // [{Categoria, Cantidad}]
      if (Array.isArray(cats) && cats.length) {
        contCats.innerHTML = cats.map(c =>
          `<button class="btn" data-cat="${c.Categoria}">${c.Categoria} (${c.Cantidad})</button>`
        ).join("");
        contCats.onclick = (e) => {
          const b = e.target.closest("[data-cat]");
          if (!b) return;
          pintarProductosDeCategoria(b.getAttribute("data-cat"));
        };
      }
    } catch {
      contCats.innerHTML = `<span class="subtle">Error cargando categorías.</span>`;
    }
  }

  // si vino ?categoria= precarga
  const catQ = params.get("categoria");
  if (catQ && contTabla) pintarProductosDeCategoria(catQ);

  async function pintarProductosDeCategoria(cat) {
    if (!contTabla) return;
    try {
      const prods = await getJSON(`/api/categorias/${encodeURIComponent(cat)}/productos`);
      if (!Array.isArray(prods) || !prods.length) {
        contTabla.innerHTML = `<div class="card"><div class="subtle">Sin productos en ${cat}.</div></div>`;
        return;
      }
      contTabla.innerHTML = `
        <div class="card">
          <div class="section-title">Productos de la categoría: ${cat}</div>
          <table class="table">
            <thead><tr><th>SKU</th><th>Producto</th><th>Stock</th><th>Precio</th><th>Estado</th></tr></thead>
            <tbody>
              ${prods.map(p => {
                const chip = estadoChip(p.Stock);
                return `
                  <tr data-sku="${p.SKU}">
                    <td>${p.SKU}</td>
                    <td>${p.Nombre}</td>
                    <td>${p.Stock}</td>
                    <td>${formateaMoneda(p.Precio)}</td>
                    <td><span class="kpi-chip ${chip.cls}">${chip.texto}</span></td>
                  </tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>`;
      const tb = contTabla.querySelector("tbody");
      if (tb) {
        tb.onclick = (e) => {
          const tr = e.target.closest("tr[data-sku]");
          if (!tr) return;
          const sku = tr.getAttribute("data-sku");
          window.location.href = `producto.html?sku=${encodeURIComponent(sku)}`;
        };
      }
    } catch {
      contTabla.innerHTML = `<div class="card"><div class="subtle">Error cargando productos de categoría.</div></div>`;
    }
  }
}

/*************************************************
 * Bootstrap por página
 *************************************************/
document.addEventListener("DOMContentLoaded", () => {
  renderDashboardSQL();
  renderInventarioSQL();
  renderProductoSQL();
  renderReportesSQL();
});
