import { getConnection } from "./db/config.js";

(async () => {
  try {
    const conn = await getConnection();
    console.log("✅ Conexión a SQL Server exitosa");

    // Ejecutar una consulta de prueba
    const result = await conn.query("SELECT DB_NAME() AS BaseDatos, SUSER_NAME() AS Usuario");
    console.log(result);

    await conn.close();
    console.log("🔒 Conexión cerrada correctamente");
  } catch (error) {
    console.error("❌ Error al conectar:", error);
  }
})();
