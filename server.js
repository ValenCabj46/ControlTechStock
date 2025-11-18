// server.js - versión con endpoints adicionales para Proveedores, Usuarios y Precios
import express from "express";
import path from "path";
import bcrypt from "bcryptjs";
import odbc from "odbc";
import dotenv from "dotenv";
import config from "./db/config.js";

dotenv.config();

const app = express();
const __dirname = path.resolve();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

async function q(sql, params = []) {
  const conn = await odbc.connect(config.connectionString);
  try {
    return await conn.query(sql, params);
  } finally {
    try { await conn.close(); } catch {}
  }
}

/* ========== LOGIN ========== */
app.post("/login", async (req, res) => {
  let conn;
  try {
    const { nombreUsuario, contrasena } = req.body || {};
    if (!nombreUsuario || !contrasena) {
      return res.status(400).json({ ok: false, mensaje: "Faltan campos" });
    }
    conn = await odbc.connect(config.connectionString);
    const rows = await conn.query("SELECT TOP 1 * FROM Usuario WHERE NombreUsuario = ?", [nombreUsuario]);
    if (!rows || rows.length === 0) return res.status(401).json({ ok: false, mensaje: "Usuario o contraseña incorrectos" });

    const usuario = rows[0];
    let hash = usuario.Contrasena;
    if (Buffer.isBuffer(hash)) hash = hash.toString("utf8");
    hash = String(hash || "").trim();

    const ok = await bcrypt.compare(String(contrasena), hash);
    if (!ok) return res.status(401).json({ ok: false, mensaje: "Usuario o contraseña incorrectos" });

    return res.status(200).json({ ok: true, redirect: "/dashboard.html" });
  } catch (e) {
    console.error("login:", e);
    return res.status(500).json({ ok: false, mensaje: "Error en el servidor" });
  } finally {
    try { if (conn) await conn.close(); } catch {}
  }
});

/* ========== APIs ========== */
app.get("/api/dashboard/summary", async (_req, res) => {
  try {
    const rs = await q(`
      SELECT 
        SUM(CAST(p.StockActual AS INT)) AS StockTotal,
        SUM(CAST(p.StockActual AS INT) * CAST(p.PrecioUnitario AS DECIMAL(18,2))) AS ValorInventario,
        SUM(CASE WHEN p.StockActual <= p.StockMinimo THEN 1 ELSE 0 END) AS Criticos
      FROM dbo.Producto p;
    `);
    res.json(rs[0] || { StockTotal: 0, ValorInventario: 0, Criticos: 0 });
  } catch (e) {
    console.error("summary:", e);
    res.status(500).json({ error: "Error obteniendo resumen" });
  }
});

app.get("/api/productos/criticos", async (_req, res) => {
  try {
    const rs = await q(`
      SELECT 
        p.CodigoSKU AS SKU,
        p.Nombre,
        c.Nombre AS Categoria,
        p.StockActual,
        p.StockMinimo,
        p.PrecioUnitario AS Precio
      FROM dbo.Producto p
      LEFT JOIN dbo.Categoria c ON c.IdCategoria = p.IdCategoria
      WHERE p.StockActual <= p.StockMinimo
      ORDER BY p.StockActual ASC, p.Nombre;
    `);
    res.json(rs);
  } catch (e) {
    console.error("criticos:", e);
    res.status(500).json({ error: "Error obteniendo críticos" });
  }
});

/* INVENTARIO: acepta filtro opcional por proveedor (query param: proveedor) */
app.get("/api/inventario", async (req, res) => {
  try {
    const proveedor = req.query.proveedor ? String(req.query.proveedor).trim() : null;
    let sql = `
      SELECT 
        p.CodigoSKU AS SKU,
        p.Nombre,
        c.Nombre AS Categoria,
        p.StockActual AS Stock,
        p.PrecioUnitario AS Precio,
        p.StockMinimo,
        p.IdProveedor
      FROM dbo.Producto p
      LEFT JOIN dbo.Categoria c ON c.IdCategoria = p.IdCategoria
    `;
    const params = [];
    if (proveedor) {
      sql += ` WHERE p.IdProveedor = ?`;
      params.push(proveedor);
    }
    sql += ` ORDER BY p.Nombre;`;
    const rs = await q(sql, params);
    res.json(rs);
  } catch (e) {
    console.error("inventario:", e);
    res.status(500).json({ error: "Error obteniendo inventario" });
  }
});

app.get("/api/categorias/criticas", async (_req, res) => {
  try {
    const rs = await q(`
      SELECT 
        c.IdCategoria,
        c.Nombre AS Categoria,
        COUNT(*) AS CantidadCriticos,
        MIN(p.StockActual) AS MinStock
      FROM dbo.Producto p
      INNER JOIN dbo.Categoria c ON c.IdCategoria = p.IdCategoria
      WHERE p.StockActual <= p.StockMinimo
      GROUP BY c.IdCategoria, c.Nombre
      ORDER BY CantidadCriticos DESC, MinStock ASC;
    `);
    res.json(rs);
  } catch (e) {
    console.error("categorias criticas:", e);
    res.status(500).json({ error: "Error obteniendo categorías críticas" });
  }
});

app.get("/api/categorias", async (_req, res) => {
  try {
    const rs = await q(`
      SELECT c.Nombre AS Categoria, COUNT(*) AS Cantidad
      FROM dbo.Producto p
      INNER JOIN dbo.Categoria c ON c.IdCategoria = p.IdCategoria
      GROUP BY c.Nombre
      ORDER BY c.Nombre;
    `);
    res.json(rs);
  } catch (e) {
    console.error("categorias:", e);
    res.status(500).json({ error: "Error obteniendo categorías" });
  }
});

app.get("/api/categorias/:nombre/productos", async (req, res) => {
  try {
    const raw = req.params.nombre || "";
    const val = decodeURIComponent(raw).trim();
    const catId = /^[0-9]+$/.test(val) ? Number(val) : null;

    const sql = catId
      ? `
        SELECT 
          p.CodigoSKU AS SKU,
          p.Nombre,
          p.StockActual AS Stock,
          p.PrecioUnitario AS Precio,
          p.StockMinimo
        FROM dbo.Producto p
        WHERE p.IdCategoria = ?
        ORDER BY p.StockActual ASC, p.Nombre;
      `
      : `
        SELECT 
          p.CodigoSKU AS SKU,
          p.Nombre,
          p.StockActual AS Stock,
          p.PrecioUnitario AS Precio,
          p.StockMinimo
        FROM dbo.Producto p
        INNER JOIN dbo.Categoria c ON c.IdCategoria = p.IdCategoria
        WHERE UPPER(LTRIM(RTRIM(c.Nombre))) = UPPER(LTRIM(RTRIM(?)))
        ORDER BY p.StockActual ASC, p.Nombre;
      `;

    const rs = await q(sql, [catId ?? val]);
    res.json(rs);
  } catch (e) {
    console.error("cat productos:", e);
    res.status(500).json({ error: "Error obteniendo productos de la categoría" });
  }
});

app.get("/api/producto/:sku", async (req, res) => {
  try {
    const raw = req.params.sku || "";
    const sku = decodeURIComponent(raw).trim();
    const prod = await q(
      `
      SELECT 
        p.CodigoSKU AS SKU,
        p.Nombre,
        c.Nombre AS Categoria,
        p.StockActual AS Stock,
        p.PrecioUnitario AS Precio,
        p.StockMinimo
      FROM dbo.Producto p
      LEFT JOIN dbo.Categoria c ON c.IdCategoria = p.IdCategoria
      WHERE UPPER(LTRIM(RTRIM(p.CodigoSKU))) = UPPER(LTRIM(RTRIM(?)));
      `,
      [sku]
    );

    if (!prod.length) return res.status(404).json({ error: "No existe el producto" });

    const movs = await q(
      `
      SELECT 
        CONVERT(varchar(10), ms.FechaMov, 23) AS Dia,
        SUM(CASE WHEN mt.Signo='+' THEN ms.Cantidad ELSE 0 END) AS Entradas,
        SUM(CASE WHEN mt.Signo='-' THEN ms.Cantidad ELSE 0 END) AS Salidas
      FROM dbo.MovimientoStock ms
      INNER JOIN dbo.MovimientoTipo mt ON mt.IdTipo = ms.IdTipo
      INNER JOIN dbo.Producto p ON p.IdProducto = ms.IdProducto
      WHERE UPPER(LTRIM(RTRIM(p.CodigoSKU))) = UPPER(LTRIM(RTRIM(?)))
        AND ms.FechaMov >= DATEADD(day,-30, GETDATE())
      GROUP BY CONVERT(varchar(10), ms.FechaMov, 23)
      ORDER BY Dia DESC;
      `,
      [sku]
    );

    res.json({ producto: prod[0], movimientos: movs });
  } catch (e) {
    console.error("producto/:sku", e);
    res.status(500).json({ error: "Error obteniendo producto" });
  }
});

/* ========== CSV manual ========== */
function objectArrayToCsv(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return "";
  const keys = Object.keys(rows[0]);
  const esc = (v) => {
    if (v == null) return "";
    const s = String(v);
    if (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const header = keys.join(",");
  const lines = rows.map(r => keys.map(k => esc(r[k])).join(","));
  return [header, ...lines].join("\r\n");
}

app.get("/api/producto/:sku/reporte.csv", async (req, res) => {
  try {
    const raw = req.params.sku || "";
    const sku = decodeURIComponent(raw).trim();
    const desde = req.query.desde ? req.query.desde.trim() : null;
    const hasta = req.query.hasta ? req.query.hasta.trim() : null;

    let sql = `
      SELECT p.CodigoSKU AS SKU, p.Nombre, CONVERT(varchar(19), ms.FechaMov, 120) AS FechaMov, mt.Nombre AS Tipo, ms.Cantidad, ms.UsuarioResp, ms.Observacion
      FROM dbo.MovimientoStock ms
      INNER JOIN dbo.MovimientoTipo mt ON mt.IdTipo = ms.IdTipo
      INNER JOIN dbo.Producto p ON p.IdProducto = ms.IdProducto
      WHERE UPPER(LTRIM(RTRIM(p.CodigoSKU))) = UPPER(LTRIM(RTRIM(?)))
    `;
    const params = [sku];

    if (desde) {
      sql += ` AND ms.FechaMov >= ?`;
      params.push(desde);
    }
    if (hasta) {
      sql += ` AND ms.FechaMov <= ?`;
      params.push(hasta);
    }
    sql += ` ORDER BY ms.FechaMov DESC;`;

    const rows = await q(sql, params);

    const outRows = rows.map(r => ({
      SKU: r.SKU,
      Nombre: r.Nombre,
      FechaMov: r.FechaMov,
      Tipo: r.Tipo,
      Cantidad: r.Cantidad,
      Usuario: r.UsuarioResp,
      Observacion: r.Observacion
    }));

    const csv = objectArrayToCsv(outRows);
    res.setHeader("Content-Disposition", `attachment; filename="reporte_${sku}.csv"`);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.send(csv);
  } catch (e) {
    console.error("CSV error:", e);
    res.status(500).json({ error: "Error generando CSV" });
  }
});

/* ========== NUEVOS ENDPOINTS: Proveedores, Usuarios por rol, Historial de precios ========== */

app.get("/api/proveedores", async (_req, res) => {
  try {
    const rs = await q(`
      SELECT 
        pr.IdProveedor,
        pr.Nombre,
        pr.Contacto,
        pr.Telefono,
        pr.Email,
        COUNT(p.IdProducto) AS ProductosSuministrados,
        SUM(CASE WHEN p.StockActual <= p.StockMinimo THEN 1 ELSE 0 END) AS ProductosCriticos
      FROM dbo.Proveedor pr
      LEFT JOIN dbo.Producto p ON p.IdProveedor = pr.IdProveedor
      GROUP BY pr.IdProveedor, pr.Nombre, pr.Contacto, pr.Telefono, pr.Email
      ORDER BY ProductosCriticos DESC, ProductosSuministrados DESC;
    `);
    res.json(rs);
  } catch (e) {
    console.error("proveedores:", e);
    res.status(500).json({ error: "Error obteniendo proveedores" });
  }
});

app.get("/api/usuarios/por-rol", async (_req, res) => {
  try {
    const rs = await q(`
      SELECT r.Nombre AS Rol, COUNT(u.IdUsuario) AS Cantidad
      FROM dbo.Usuario u
      LEFT JOIN dbo.Rol r ON r.IdRol = u.IdRol
      GROUP BY r.Nombre
      ORDER BY Cantidad DESC;
    `);
    res.json(rs);
  } catch (e) {
    console.error("usuarios por rol:", e);
    res.status(500).json({ error: "Error obteniendo usuarios por rol" });
  }
});

app.get("/api/precios/cambios-recientes", async (_req, res) => {
  try {
    const rs = await q(`
      SELECT TOP 20
        ph.IdPrecioHist,
        ph.IdProducto,
        p.CodigoSKU AS SKU,
        p.Nombre AS Producto,
        ph.Precio,
        CONVERT(varchar(19), ph.FechaInicio, 120) AS FechaInicio,
        u.NombreUsuario AS Usuario
      FROM dbo.PrecioHistorial ph
      LEFT JOIN dbo.Producto p ON p.IdProducto = ph.IdProducto
      LEFT JOIN dbo.Usuario u ON u.IdUsuario = ph.IdUsuario
      ORDER BY ph.FechaInicio DESC;
    `);
    res.json(rs);
  } catch (e) {
    console.error("precios recientes:", e);
    res.status(500).json({ error: "Error obteniendo historial de precios" });
  }
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
