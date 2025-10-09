import express from "express";
import path from "path";
import odbc from "odbc";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import config from "./db/config.js";

dotenv.config();
const app = express();
const __dirname = path.resolve();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.post("/login", async (req, res) => {
  const { nombreUsuario, contrasena } = req.body;
  console.log("Datos recibidos:", req.body);

  try {
    const conn = await odbc.connect(config.connectionString);
    const result = await conn.query(
      "SELECT * FROM Usuario WHERE NombreUsuario = ?",
      [nombreUsuario]
    );

    if (!result || result.length === 0) {
      console.log("❌ Usuario no encontrado");
      return res.status(401).json({ success: false, message: "Usuario no encontrado" });
    }

    const usuario = result[0];
    let hash = usuario.Contrasena;
    if (Buffer.isBuffer(hash)) hash = hash.toString("utf8");
    hash = String(hash).trim();

    const coincide = await bcrypt.compare(contrasena.trim(), hash);
    console.log("Resultado de bcrypt.compare():", coincide);

    if (!coincide) {
      console.log("❌ Contraseña incorrecta");
      return res.status(401).json({ success: false, message: "Contraseña incorrecta" });
    }

    console.log("✅ Inicio de sesión correcto");
    return res.json({ success: true, redirectUrl: "/dashboard.html" });
  } catch (err) {
    console.error("❌ Error en el login:", err);
    return res.status(500).json({ success: false, message: "Error en el servidor" });
  }
});

app.listen(3000, () => console.log("Servidor corriendo en puerto 3000"));
