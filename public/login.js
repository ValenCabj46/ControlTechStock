document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const btn  = document.getElementById("btnLogin");
  const msg  = document.getElementById("msg");

  form?.addEventListener("submit", (e) => e.preventDefault());

  btn?.addEventListener("click", async () => {
    msg.textContent = "";
    msg.className = "msg";

    const nombreUsuario = document.getElementById("nombreUsuario")?.value.trim();
    const contrasena    = document.getElementById("contrasena")?.value.trim();

    if (!nombreUsuario || !contrasena) {
      msg.textContent = "Completa usuario y contraseña.";
      msg.className = "msg error";
      return;
    }

    try {
      const resp = await fetch("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombreUsuario, contrasena })
      });

      const ct = resp.headers.get("content-type") || "";
      // Log de depuración útil:
      console.log("[LOGIN] status:", resp.status, "content-type:", ct);

      if (!ct.includes("application/json")) {
        const text = await resp.text().catch(()=>"(sin texto)");
        console.error("[LOGIN] Respuesta no-JSON:", text);
        msg.textContent = "Respuesta inesperada del servidor.";
        msg.className = "msg error";
        return;
      }

      const data = await resp.json();
      console.log("[LOGIN] payload:", data);

      if (resp.ok && data?.ok === true && data.redirect) {
        msg.textContent = "Acceso concedido. Redirigiendo…";
        msg.className   = "msg ok";
        window.location.href = data.redirect;
        return;
      }

      // Muestra el motivo real llegado desde el backend
      msg.textContent = data?.mensaje || "Usuario o contraseña incorrectos.";
      msg.className   = "msg error";
    } catch (err) {
      console.error("[LOGIN] Error de red:", err);
      msg.textContent = "Error de conexión con el servidor.";
      msg.className   = "msg error";
    }
  });
});
