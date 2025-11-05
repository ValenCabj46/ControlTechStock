import express from "express";
import path from "path";
import bcrypt from "bcryptjs";
import odbc from "odbc";
import dotenv from "dotenv";
import config from "./db/config.js";

dotenv.config();

const app = express();
const __dirname = path.resolve();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// Página por defecto -> login
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// Helper de conexión simple
async function q(sql, params = []) {
  const conn = await odbc.connect(config.connectionString);
  try {
    return await conn.query(sql, params);
  } finally {
    await conn.close();
  }
}

/* =========================
   LOGIN –  JSON
   ========================= */
app.post("/login", async (req, res) => {
  let conn; // para cerrar sí o sí
  try {
    const { nombreUsuario, contrasena } = req.body || {};
    console.log("Datos recibidos:", req.body);

    if (!nombreUsuario || !contrasena) {
      return res.status(400).json({ ok: false, mensaje: "Faltan campos" });
    }

    conn = await odbc.connect(config.connectionString);
    console.log("✅ Conexión a SQL Server LocalDB establecida correctamente");

    const sql = "SELECT TOP 1 * FROM Usuario WHERE NombreUsuario = ?";
    const rows = await conn.query(sql, [nombreUsuario]);

    if (!rows || rows.length === 0) {
      console.warn("❌ Usuario no encontrado");
      return res.status(401).json({ ok: false, mensaje: "Usuario o contraseña incorrectos" });
    }

    const usuario = rows[0];
    let hash = usuario.Contrasena;
    if (Buffer.isBuffer(hash)) hash = hash.toString("utf8");
    hash = String(hash || "").trim();

    const ok = await bcrypt.compare(String(contrasena), hash);
    console.log("Resultado de bcrypt.compare():", ok);

    if (!ok) {
      console.warn("❌ Contraseña incorrecta — acceso denegado");
      return res.status(401).json({ ok: false, mensaje: "Usuario o contraseña incorrectos" });
    }

    console.log("✅ Inicio de sesión correcto — acceso permitido");
    return res.status(200).json({ ok: true, redirect: "/dashboard.html" });
  } catch (err) {
    console.error("❌ Error en el login:", err);
    return res.status(500).json({ ok: false, mensaje: "Error en el servidor" });
  } finally {
    // cierre garantizado
    try { if (conn) await conn.close(); } catch {}
  }
});

/* =========================
   APIs (como ya tenías)
   ========================= */

// KPIs dashboard
app.get("/api/dashboard/summary", async (_req, res) => {
  try {
    const rs = await q(`
      SELECT 
        SUM(CAST(p.StockActual AS INT)) AS StockTotal,
        SUM(CAST(p.StockActual AS INT) * CAST(p.PrecioUnitario AS DECIMAL(18,2))) AS ValorInventario,
        SUM(CASE WHEN p.StockActual < 10 THEN 1 ELSE 0 END) AS Criticos
      FROM dbo.Producto p;
    `);
    res.json(rs[0] || { StockTotal: 0, ValorInventario: 0, Criticos: 0 });
  } catch (e) {
    console.error("summary:", e);
    res.status(500).json({ error: "Error obteniendo resumen" });
  }
});

// Productos críticos
app.get("/api/productos/criticos", async (_req, res) => {
  try {
    const rs = await q(`
      SELECT 
        p.CodigoSKU AS SKU,
        p.Nombre,
        c.Nombre AS Categoria,
        p.StockActual,
        p.PrecioUnitario AS Precio
      FROM dbo.Producto p
      LEFT JOIN dbo.Categoria c ON c.IdCategoria = p.IdCategoria
      WHERE p.StockActual < 10
      ORDER BY p.StockActual ASC, p.Nombre;
    `);
    res.json(rs);
  } catch (e) {
    console.error("criticos:", e);
    res.status(500).json({ error: "Error obteniendo críticos" });
  }
});

// Inventario completo
app.get("/api/inventario", async (_req, res) => {
  try {
    const rs = await q(`
      SELECT 
        p.CodigoSKU AS SKU,
        p.Nombre,
        c.Nombre AS Categoria,
        p.StockActual AS Stock,
        p.PrecioUnitario AS Precio
      FROM dbo.Producto p
      LEFT JOIN dbo.Categoria c ON c.IdCategoria = p.IdCategoria
      ORDER BY p.Nombre;
    `);
    res.json(rs);
  } catch (e) {
    console.error("inventario:", e);
    res.status(500).json({ error: "Error obteniendo inventario" });
  }
});

// Ficha producto + movimientos
// Ficha producto + movimientos (tolerante a espacios/caso en el SKU)
app.get("/api/producto/:sku", async (req, res) => {
  const raw = req.params.sku || "";
  const sku = decodeURIComponent(raw).trim();

  try {
    const prod = await q(
      `
      SELECT 
        p.CodigoSKU AS SKU,
        p.Nombre,
        c.Nombre AS Categoria,
        p.StockActual AS Stock,
        p.PrecioUnitario AS Precio
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
        CONVERT(date, ms.FechaMov) AS Dia,
        SUM(CASE WHEN mt.Signo='+' THEN ms.Cantidad ELSE 0 END) AS Entradas,
        SUM(CASE WHEN mt.Signo='-' THEN ms.Cantidad ELSE 0 END) AS Salidas
      FROM dbo.MovimientoStock ms
      INNER JOIN dbo.MovimientoTipo mt ON mt.IdTipo = ms.IdTipo
      INNER JOIN dbo.Producto p ON p.IdProducto = ms.IdProducto
      WHERE UPPER(LTRIM(RTRIM(p.CodigoSKU))) = UPPER(LTRIM(RTRIM(?)))
        AND ms.FechaMov >= DATEADD(day,-30, GETDATE())
      GROUP BY CONVERT(date, ms.FechaMov)
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


// Categorías
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

// Productos por categoría (por Id o por Nombre, tolerante a mayúsculas/acentos/espacios)
// Productos por categoría: acepta Id numérico o Nombre (tolerante a espacios/caso)
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
          p.PrecioUnitario AS Precio
        FROM dbo.Producto p
        WHERE p.IdCategoria = ?
        ORDER BY p.Nombre;
        `
      : `
        SELECT 
          p.CodigoSKU AS SKU,
          p.Nombre,
          p.StockActual AS Stock,
          p.PrecioUnitario AS Precio
        FROM dbo.Producto p
        INNER JOIN dbo.Categoria c ON c.IdCategoria = p.IdCategoria
        WHERE UPPER(LTRIM(RTRIM(c.Nombre))) = UPPER(LTRIM(RTRIM(?)))
        ORDER BY p.Nombre;
        `;

    const rs = await q(sql, [catId ?? val]);
    res.json(rs);
  } catch (e) {
    console.error("cat productos:", e);
    res.status(500).json({ error: "Error obteniendo productos de la categoría" });
  }
});



// Arranque
app.listen(3000, () => {
  console.log("Servidor corriendo en puerto 3000");
});
