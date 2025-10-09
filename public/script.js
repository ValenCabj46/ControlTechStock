document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const nombreUsuario = document.getElementById("usuario").value;
  const contrasena = document.getElementById("contrasena").value;

  const res = await fetch("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nombreUsuario, contrasena }),
  });

  const data = await res.json();
  const mensaje = document.getElementById("mensaje");

  if (res.ok) {
    mensaje.textContent = "✅ Acceso correcto. Redirigiendo...";
    setTimeout(() => window.location.href = "dashboard.html", 1000);
  } else {
    mensaje.textContent = "❌ " + data.message;
  }
});
