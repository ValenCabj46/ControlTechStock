document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("btnLogin");
  const msg = document.getElementById("msg");

  
  document.getElementById("loginForm").addEventListener("submit", (e) => e.preventDefault());

  btn.addEventListener("click", async () => {
    msg.textContent = "";
    const nombreUsuario = document.getElementById("nombreUsuario").value.trim();
    const contrasena = document.getElementById("contrasena").value.trim();

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

      // Si el servidor no responde JSON válido, no redirige
      const data = await resp.json().catch(() => null);
      console.log("Respuesta del servidor:", data);

      if (!data || data.ok !== true) {
        msg.textContent = (data && data.mensaje) ? data.mensaje : "Usuario o contraseña incorrectos.";
        msg.className = "msg error";
        return; 
      }

      // Solo redirige cuando ok = true
      window.location.href = data.redirect;
    } catch (e) {
      console.error("Error en login.js:", e);
      msg.textContent = "Error de conexión con el servidor.";
      msg.className = "msg error";
    }
  });
});


