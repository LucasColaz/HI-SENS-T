document.addEventListener("DOMContentLoaded", () => {
    
    const API_URL = '';  
    const resetForm = document.getElementById("reset-form");
    const errorMsg = document.getElementById("error-message");
    const passwordInput = document.getElementById("password");
    
    // [NUEVO] Referencias a los requisitos
    const reqLength = document.getElementById("req-length");
    const reqUpper = document.getElementById("req-upper");
    const reqNumber = document.getElementById("req-number");
    
    const token = localStorage.getItem("hiSens_token");
    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    // [NUEVO] Listener para validación en tiempo real
    passwordInput.addEventListener("keyup", () => {
        validatePasswordRealtime(passwordInput.value);
    });

    resetForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        errorMsg.classList.add("hidden");

        const pass1 = passwordInput.value;
        const pass2 = document.getElementById("password_confirm").value;

        // 1. Validar que las contraseñas coincidan
        if (pass1 !== pass2) {
            errorMsg.textContent = "Error: Las contraseñas no coinciden.";
            errorMsg.classList.remove("hidden");
            return;
        }

        // 2. Validar complejidad (ahora devuelve true/false)
        if (!validatePasswordRealtime(pass1)) {
            errorMsg.textContent = "Error: La contraseña no cumple todos los requisitos.";
            errorMsg.classList.remove("hidden");
            return;
        }

        // 3. Enviar la nueva contraseña al backend
        try {
            const response = await fetch(`${API_URL}/api/usuarios/cambiar-password-propio`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify({
                    new_password: pass1
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || "Error al actualizar la contraseña");
            }
            
            alert("Contraseña actualizada exitosamente. Serás redirigido al dashboard.");
            window.location.href = 'index.html';

        } catch (error) {
            errorMsg.textContent = `Error: ${error.message}`;
            errorMsg.classList.remove("hidden");
        }
    });
    
    /**
     * [NUEVO] Validador en tiempo real (actualiza la UI)
     * Devuelve 'true' si todo es válido, 'false' si no.
     */
    function validatePasswordRealtime(password) {
        let allValid = true;

        // Validar 8 caracteres
        if (password.length >= 8) {
            reqLength.classList.add("valid");
        } else {
            reqLength.classList.remove("valid");
            allValid = false;
        }

        // Validar mayúscula
        if (/[A-Z]/.test(password)) {
            reqUpper.classList.add("valid");
        } else {
            reqUpper.classList.remove("valid");
            allValid = false;
        }

        // Validar número
        if (/[0-9]/.test(password)) {
            reqNumber.classList.add("valid");
        } else {
            reqNumber.classList.remove("valid");
            allValid = false;
        }
        
        return allValid;
    }
});