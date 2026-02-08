/*
  HI SENS – Usuarios.js v5.0 (Definitivo)
  - Gestión completa de usuarios.
  - Validaciones de seguridad.
  - Gestión de suscripciones por área.
*/

// --- Usar las funciones globales de auth-nav.js ---
const getToken = window.getGlobalToken;
const fetchWithToken = window.fetchWithToken;
const API_URL = '';

document.addEventListener("DOMContentLoaded", () => {
  
  // --- Referencias a Elementos del DOM ---
  
  // Modal Principal (Crear/Editar)
  const modalBackdrop = document.getElementById("user-modal-backdrop");
  const modal = document.getElementById("user-modal");
  const modalTitle = document.getElementById("user-modal-title");
  const modalError = document.getElementById("user-modal-error");
  const passwordFields = modal.querySelector(".create-only-fields");
  
  // Campos del Formulario Principal
  const formNombre = document.getElementById("user-nombre");
  const formUsuario = document.getElementById("user-usuario");
  const formRol = document.getElementById("user-rol");
  const formPuesto = document.getElementById("user-puesto");
  const formEmail = document.getElementById("user-email");
  const formTelefono = document.getElementById("user-telefono");
  const formPassword = document.getElementById("user-password");
  const formPasswordConfirm = document.getElementById("user-password-confirm");
  
  // Botones del Modal Principal
  const closeBtn = document.getElementById("user-modal-close-btn");
  const cancelBtn = document.getElementById("user-modal-cancel-btn");
  const saveBtn = document.getElementById("user-modal-save-btn");
  
  // Botón de Crear en la página
  const createButton = document.getElementById("create-user-btn");
  
  // Tabla
  const tableBody = document.getElementById("user-table-body"); 
  
  // Pestañas del Modal
  const tabLinks = modal.querySelectorAll(".tab-link");
  const tabPanes = modal.querySelectorAll(".tab-pane");
  const subscriptionContainer = document.querySelector(".subscription-list");

  // Modal de Borrado
  const deleteModalBackdrop = document.getElementById("delete-modal-backdrop");
  const deleteModal = document.getElementById("delete-modal");
  const deleteModalError = document.getElementById("delete-modal-error");
  const deleteUserSpan = document.getElementById("delete-user-span");
  const deletePasswordInput = document.getElementById("admin-password");
  const deleteCloseBtn = document.getElementById("delete-modal-close-btn");
  const deleteCancelBtn = document.getElementById("delete-modal-cancel-btn");
  const deleteForm = document.getElementById("delete-form");

  // Requisitos de Contraseña (Visual)
  const modalReqLength = document.getElementById("modal-req-length");
  const modalReqUpper = document.getElementById("modal-req-upper");
  const modalReqNumber = document.getElementById("modal-req-number");


  // --- INICIO: Cargar Datos ---
  cargarUsuarios();


  // --- Lógica de Pestañas ---
  tabLinks.forEach(link => {
    link.addEventListener("click", () => {
      const tabId = link.getAttribute("data-tab");
      tabLinks.forEach(item => item.classList.remove("active"));
      tabPanes.forEach(pane => pane.classList.remove("active"));
      link.classList.add("active");
      modal.querySelector(`#${tabId}`).classList.add("active");
    });
  });


  // --- FUNCIONES DE MODALES (Abrir/Cerrar) ---

  function showModal() {
    modalBackdrop.classList.remove("hidden");
    modal.classList.remove("hidden");
    modalError.classList.add("hidden"); 
    // Resetear a la primera pestaña
    tabLinks[0].click();
  }

  function hideModal() {
    modalBackdrop.classList.add("hidden");
    modal.classList.add("hidden");
  }
  
  function showDeleteModal(username) {
    deleteUserSpan.textContent = username;
    deletePasswordInput.value = ""; 
    deleteModalError.classList.add("hidden");
    deleteModalBackdrop.classList.remove("hidden");
    deleteModal.classList.remove("hidden");
    deleteForm.setAttribute("data-delete-user", username);
  }

  function hideDeleteModal() {
    deleteModalBackdrop.classList.add("hidden");
    deleteModal.classList.add("hidden");
  }

  // Listeners de Cierre
  closeBtn.addEventListener("click", hideModal);
  cancelBtn.addEventListener("click", hideModal);
  modalBackdrop.addEventListener("click", hideModal);
  
  deleteCloseBtn.addEventListener("click", hideDeleteModal);
  deleteCancelBtn.addEventListener("click", hideDeleteModal);
  deleteModalBackdrop.addEventListener("click", hideDeleteModal);


  // --- LÓGICA: CREAR USUARIO ---

  if (createButton) {
      createButton.addEventListener("click", () => {
        modal.setAttribute("data-mode", "create");
        modalTitle.textContent = "Crear Nuevo Usuario";
        
        // Limpiar campos
        formNombre.value = "";
        formUsuario.value = "";
        formRol.value = "Tecnico"; 
        formPuesto.value = "";
        formEmail.value = "";
        formTelefono.value = "";
        formPassword.value = "";
        formPasswordConfirm.value = "";
        
        // Configurar UI para "Crear"
        formUsuario.disabled = false;
        passwordFields.classList.remove("hidden");
        validatePasswordRealtime(""); // Resetear validadores visuales
        
        // Cargar áreas (checkboxes vacíos)
        cargarAreasYRenderizarCheckboxes([]);
        
        showModal();
      });
  }

  // --- LÓGICA: TABLA (Delegación de Eventos) ---

  if (tableBody) {
      tableBody.addEventListener("click", (e) => {
        // No prevenir default globalmente para permitir selección de texto, 
        // solo si es un botón
        const target = e.target;
        
        if (target.classList.contains("edit-user-btn")) {
            e.preventDefault();
            const userRow = target.closest(".user-row");
            handleOpenEditModal(userRow);
        }
        
        if (target.classList.contains("action-delete")) {
            e.preventDefault();
            const userRow = target.closest(".user-row");
            const username = userRow.getAttribute("data-usuario");
            showDeleteModal(username);
        }
      });
  }

  // --- LÓGICA: EDITAR USUARIO ---

  function handleOpenEditModal(userRow) {
      modal.setAttribute("data-mode", "edit");
      const nombre = userRow.getAttribute("data-nombre");
      modalTitle.textContent = `Editar Usuario: ${nombre}`;
      
      // Rellenar campos
      formNombre.value = userRow.getAttribute("data-nombre");
      formUsuario.value = userRow.getAttribute("data-usuario");
      formRol.value = userRow.getAttribute("data-rol");
      formPuesto.value = userRow.getAttribute("data-puesto");
      formEmail.value = userRow.getAttribute("data-email");
      // telefono...
      
      // Configurar UI para "Editar"
      formUsuario.disabled = true; // No se puede cambiar el username
      passwordFields.classList.add("hidden"); // No se cambia pass aquí
      
      // Recuperar suscripciones de la fila y marcar checkboxes
      const suscripcionesStr = userRow.getAttribute("data-suscripciones") || "[]";
      const suscripciones = JSON.parse(suscripcionesStr);
      cargarAreasYRenderizarCheckboxes(suscripciones);
      
      showModal();
  }


  // --- LÓGICA: GUARDAR (Botón Principal) ---

  saveBtn.addEventListener("click", async () => {
    const mode = modal.getAttribute("data-mode");
    
    // Recolectar suscripciones marcadas
    const checkboxes = subscriptionContainer.querySelectorAll('input[type="checkbox"]:checked');
    const suscripcionesSeleccionadas = Array.from(checkboxes).map(cb => cb.value);

    if (mode === "create") {
       await handleCreateUser(suscripcionesSeleccionadas);
    } else {
       await handleEditUser(suscripcionesSeleccionadas);
    }
  });

    async function handleCreateUser(subs) {
      modalError.classList.add("hidden");
      
      // VALIDACIÓN NUEVA
      if (!formEmail.value || !formEmail.value.trim().includes('@')) {
          throw new Error("Debes ingresar un Email válido.");
      }

      const pass1 = formPassword.value;
      const pass2 = formPasswordConfirm.value;
      
      if (pass1 !== pass2) {
          throw new Error("Las contraseñas no coinciden.");
      }

      const userData = {
          username: formUsuario.value,
          nombre_completo: formNombre.value,
          email: formEmail.value,
          rol: formRol.value,
          puesto: formPuesto.value,
          password: pass1,
          suscripciones: subs
      };

      try {
        const response = await fetchWithToken(`${API_URL}/api/usuarios/crear`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData),
        });
        
        if(!response.ok) { 
            const d = await response.json(); 
            throw new Error(d.detail || "Error al crear"); 
        }
        
        alert("Usuario creado exitosamente.");
        hideModal();
        cargarUsuarios();
      } catch (e) {
          modalError.textContent = e.message;
          modalError.classList.remove("hidden");
      }
  }

    async function handleEditUser(subs) {
      modalError.classList.add("hidden");
      
      // VALIDACIÓN NUEVA
      if (!formEmail.value || !formEmail.value.trim().includes('@')) {
          throw new Error("Debes ingresar un Email válido.");
      }

      const username = formUsuario.value;
      
      const userData = {
          nombre_completo: formNombre.value,
          email: formEmail.value,
          rol: formRol.value,
          puesto: formPuesto.value,
          suscripciones: subs
      };

      try {
        const response = await fetchWithToken(`${API_URL}/api/usuarios/editar/${username}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData),
        });
        
        if(!response.ok) { 
            const d = await response.json(); 
            throw new Error(d.detail || "Error al editar"); 
        }
        
        alert("Usuario actualizado exitosamente.");
        hideModal();
        cargarUsuarios();
      } catch (e) {
          modalError.textContent = e.message;
          modalError.classList.remove("hidden");
      }
  }


  // --- LÓGICA: BORRAR USUARIO ---

  deleteForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    deleteModalError.classList.add("hidden");
    
    const usernameToDelete = deleteForm.getAttribute("data-delete-user");
    const adminPassword = deletePasswordInput.value;

    if (!adminPassword) {
      deleteModalError.textContent = "Ingrese su contraseña.";
      deleteModalError.classList.remove("hidden");
      return;
    }

    try {
      const response = await fetchWithToken(`${API_URL}/api/usuarios/borrar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username_to_delete: usernameToDelete,
          admin_password: adminPassword
        })
      });

      if (response.status === 401) throw new Error("Contraseña incorrecta.");
      if (response.status === 404) throw new Error("Usuario no encontrado.");
      if (!response.ok) {
          const d = await response.json();
          throw new Error(d.detail || "Error al borrar");
      }
      
      alert(`Usuario "${usernameToDelete}" borrado.`);
      hideDeleteModal();
      cargarUsuarios();

    } catch (error) {
      deleteModalError.textContent = error.message;
      deleteModalError.classList.remove("hidden");
    }
  });


  // --- HELPERS ---

  // Cargar Lista de Usuarios
  async function cargarUsuarios() {
    try {
        const response = await fetchWithToken(`${API_URL}/api/usuarios/all`);
        if (!response.ok) throw new Error("Error cargando lista");
        const usuarios = await response.json();
        renderizarTabla(usuarios);
    } catch (error) {
        console.error(error);
        if (tableBody) tableBody.innerHTML = `<tr><td colspan="6" style="color: red; text-align: center;">${error.message}</td></tr>`;
    }
  }

  // Renderizar Tabla
  function renderizarTabla(usuarios) {
      if (!tableBody) return;
      tableBody.innerHTML = '';
      
      if (usuarios.length === 0) {
          tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center;">No hay usuarios registrados.</td></tr>`;
          return;
      }
      
      // Necesitamos saber quién es el usuario actual para no dejar que se borre a sí mismo
      const currentUser = parseJwt(getToken()).sub;

      usuarios.forEach(u => {
          const row = document.createElement('tr');
          row.className = 'user-row';
          // Guardar datos en atributos para acceso rápido
          row.setAttribute('data-usuario', u.username);
          row.setAttribute('data-nombre', u.nombre_completo);
          row.setAttribute('data-rol', u.rol);
          row.setAttribute('data-puesto', u.puesto || '');
          row.setAttribute('data-email', u.email);
          row.setAttribute('data-suscripciones', JSON.stringify(u.suscripciones || []));
          
          let rolClass = u.rol === 'Admin' ? 'status-admin' : 'status-tecnico';
          
          // Botón borrar (oculto para uno mismo)
          let deleteButton = '';
          if (u.username !== currentUser) {
             deleteButton = '<a href="#" class="action-link action-delete">Borrar</a>';
          }

          row.innerHTML = `
            <td>${u.nombre_completo}</td>
            <td>${u.username}</td>
            <td><span class="status-badge ${rolClass}">${u.rol}</span></td>
            <td>${u.puesto || ''}</td>
            <td>${u.email}</td>
            <td>
                <a href="#" class="action-link edit-user-btn">Editar</a>
                ${deleteButton}
            </td>
          `;
          tableBody.appendChild(row);
      });
  }

  // Cargar Areas y Checkboxes
  async function cargarAreasYRenderizarCheckboxes(suscripcionesActivas = []) {
      subscriptionContainer.innerHTML = '<p>Cargando áreas...</p>';
      try {
          const response = await fetchWithToken(`${API_URL}/api/nodos/all`);
          if (!response.ok) throw new Error("Error cargando áreas");
          const nodos = await response.json();
          
          const areas = new Set();
          nodos.forEach(n => { if(n.area) areas.add(n.area); });

          subscriptionContainer.innerHTML = '';
          if (areas.size === 0) {
              subscriptionContainer.innerHTML = '<p>No hay áreas configuradas (crear Nodos primero).</p>';
              return;
          }

          areas.forEach(area => {
              const div = document.createElement('div');
              div.className = 'input-group-checkbox';
              const isChecked = suscripcionesActivas.includes(area) ? 'checked' : '';
              
              div.innerHTML = `
                <input type="checkbox" id="sub-area-${area}" value="${area}" ${isChecked}>
                <label for="sub-area-${area}"><strong>${area}</strong></label>
              `;
              subscriptionContainer.appendChild(div);
          });

      } catch (e) {
          console.error(e);
          subscriptionContainer.innerHTML = '<p style="color:red">Error cargando áreas.</p>';
      }
  }

  // Validación de Contraseña
  formPassword.addEventListener("keyup", () => {
    validatePasswordRealtime(formPassword.value);
  });

  function validatePasswordRealtime(password) {
    let valid = true;
    if (password.length >= 8) modalReqLength.classList.add("valid");
    else { modalReqLength.classList.remove("valid"); valid = false; }
    
    if (/[A-Z]/.test(password)) modalReqUpper.classList.add("valid");
    else { modalReqUpper.classList.remove("valid"); valid = false; }
    
    if (/[0-9]/.test(password)) modalReqNumber.classList.add("valid");
    else { modalReqNumber.classList.remove("valid"); valid = false; }
    return valid;
  }

  // Decodificar JWT
  function parseJwt(token) {
    try { return JSON.parse(atob(token.split('.')[1])); } catch (e) { return null; }
  }

});