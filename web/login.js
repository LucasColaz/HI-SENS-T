document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.getElementById("login-form");
    const errorMsg = document.getElementById("error-message");

    // [CLAVE] Usamos ruta relativa. Funciona en Local y en Railway.
    const API_ENDPOINT = '/api/token'; 

    if (loginForm) {
        loginForm.addEventListener("submit", async (e) => {
            // 1. ESTA LÍNEA ES LA MÁS IMPORTANTE. Evita el error 405.
            e.preventDefault(); 
            
            if (errorMsg) errorMsg.classList.add("hidden"); 

            const formData = new URLSearchParams();
            // Asegurate de que los IDs en tu HTML sean 'usuario' y 'password'
            const userVal = document.getElementById("usuario").value;
            const passVal = document.getElementById("password").value;

            formData.append("username", userVal);
            formData.append("password", passVal);

            try {
                const response = await fetch(API_ENDPOINT, {
                    method: 'POST',
                    body: formData,
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.detail || "Error de autenticación");
                }

                // Guardar token y rol
                localStorage.setItem("hiSens_token", data.access_token);
                localStorage.setItem("hiSens_rol", data.rol);
                
                if (data.must_reset === true) {
                    console.log("Login exitoso, se requiere cambio de contraseña.");
                    window.location.href = 'reset-password.html'; 
                } else {
                    console.log("Login exitoso, redirigiendo al dashboard.");
                    window.location.href = 'index.html'; 
                }

            } catch (error) {
                console.error(error);
                if (errorMsg) {
                    errorMsg.textContent = `Error: ${error.message}`;
                    errorMsg.classList.remove("hidden");
                } else {
                    alert(`Error: ${error.message}`);
                }
            }
        });
    } else {
        console.error("No se encontró el formulario 'login-form' en el HTML.");
    }
});