const API_BASE = "http://localhost:3000/api";
const TOKEN_KEY = "daylist_token";
const USER_KEY = "daylist_user";

const state = { token: sessionStorage.getItem(TOKEN_KEY), user: readStoredUser(), tasks: [], filter: "all", search: "", editingId: null, toastTimer: null };
const $ = (selector) => document.querySelector(selector);
const authView = $("#auth-view");
const appView = $("#app-view");

function readStoredUser() {
  try { return JSON.parse(sessionStorage.getItem(USER_KEY) || "null"); }
  catch { return null; }
}

function storeSession(token, user) {
  state.token = token;
  state.user = user;
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

function clearSession() {
  state.token = null;
  state.user = null;
  state.tasks = [];
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}

function setAuthMode(mode) {
  const registering = mode === "register";
  $("#auth-form").dataset.mode = mode;
  $("#name-field").hidden = !registering;
  $("#confirm-field").hidden = !registering;
  $("#auth-eyebrow").textContent = registering ? "A FRESH START" : "WELCOME BACK";
  $("#auth-title").innerHTML = registering ? 'Make today yours<span class="pink-dot">.</span>' : 'Good to see you<span class="pink-dot">.</span>';
  $("#auth-subtitle").textContent = registering ? "Create your account and start planning gently." : "Pick up where you left off.";
  $("#auth-submit").innerHTML = registering ? 'Create account <span aria-hidden="true">→</span>' : 'Log in <span aria-hidden="true">→</span>';
  $("#auth-switch-copy").textContent = registering ? "Already have an account?" : "New to Daylist?";
  $("#auth-switch").textContent = registering ? "Log in" : "Create an account";
  $("#auth-form").elements.password.autocomplete = registering ? "new-password" : "current-password";
  hideNotice($("#auth-message"));
}

function showAuth() {
  authView.hidden = false;
  appView.hidden = true;
  setAuthMode("login");
}

function showApp() {
  authView.hidden = true;
  appView.hidden = false;
  const name = state.user?.name || "Daylist user";
  $("#user-name").textContent = name;
  $("#user-avatar").textContent = name.trim().charAt(0).toUpperCase() || "D";
  $("#today-date").textContent = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date());
  const hour = new Date().getHours();
  $("#greeting").innerHTML = `${hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"}<span class="pink-dot">.</span>`;
}

function showNotice(element, message, success = false) {
  element.textContent = message;
  element.classList.toggle("success", success);
  element.hidden = false;
}

function hideNotice(element) {
  element.hidden = true;
  element.textContent = "";
  element.classList.remove("success");
}

async function request(path, options = {}) {
  const headers = { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}), ...options.headers };
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch {
    throw new Error("Tidak dapat terhubung ke backend. Pastikan server Daylist berjalan di http://localhost:3000.");
  }
  let data;
  try { data = await response.json(); }
  catch { throw new Error("Respons server tidak valid. Coba lagi sebentar."); }
  if (!response.ok) {
    if (response.status === 401 && state.token) {
      clearSession();
      showAuth();
      showNotice($("#auth-message"), "Sesi berakhir atau token tidak valid. Silakan login kembali.");
    }
    throw new Error(data.message || "Permintaan gagal. Silakan coba lagi.");
  }
  return data;
}

async function submitAuth(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form).entries());
  const registering = form.dataset.mode === "register";
  const email = String(values.email || "").trim();
  const password = String(values.password || "");
  const name = String(values.name || "").trim();
  if (registering && (!name || name.length > 100)) return showNotice($("#auth-message"), "Nama wajib diisi dan maksimal 100 karakter.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 150) return showNotice($("#auth-message"), "Masukkan alamat email yang valid.");
  if (password.length < 8) return showNotice($("#auth-message"), "Password harus memiliki minimal 8 karakter.");
  if (registering && values.confirmPassword !== password) return showNotice($("#auth-message"), "Konfirmasi password belum sama.");
  const button = $("#auth-submit");
  button.disabled = true;
  button.textContent = registering ? "Creating account..." : "Logging in...";
  hideNotice($("#auth-message"));
  try {
    const data = await request(`/auth/${registering ? "register" : "login"}`, { method: "POST", body: JSON.stringify(registering ? { name, email, password } : { email, password }) });
    storeSession(data.data.token, data.data.user);
    showApp();
    await loadTasks();
    showToast(registering ? "Akun berhasil dibuat. Selamat datang!" : "Selamat datang kembali!");
  } catch (error) {
    if (!appView.hidden) return;
    showNotice($("#auth-message"), error.message);
  } finally {
    button.disabled = false;
    button.innerHTML = registering ? 'Create account <span aria-hidden="true">→</span>' : 'Log in <span aria-hidden="true">→</span>';
  }
}

async function loadTasks() {
  $("#loading-state").hidden = false;
  $("#task-list").replaceChildren();
  $("#empty-state").hidden = true;
  $("#page-message").hidden = true;
  try {
    const data = await request("/tasks");
    state.tasks = data.data;
    renderTasks();
  } catch (error) {
    if (!state.token) return;
    $("#loading-state").hidden = true;
    $("#page-message").textContent = error.message;
    $("#page-message").hidden = false;
  }
}

function filteredTasks() {
  const today = localDateString(new Date());
  return state.tasks.filter((task) => {
    const matchesSearch = task.title.toLocaleLowerCase().includes(state.search.toLocaleLowerCase());
    const matchesFilter = state.filter === "all" ||
      (state.filter === "today" && task.due_date === today && !task.is_completed) ||
      (state.filter === "upcoming" && task.due_date > today && !task.is_completed) ||
      (state.filter === "completed" && task.is_completed);
    return matchesSearch && matchesFilter;
  }).sort((a, b) => Number(a.is_completed) - Number(b.is_completed) || (a.due_date || "9999-12-31").localeCompare(b.due_date || "9999-12-31") || b.id - a.id);
}

function renderTasks() {
  $("#loading-state").hidden = true;
  const total = state.tasks.length;
  const completed = state.tasks.filter((task) => task.is_completed).length;
  const pending = total - completed;
  const today = localDateString(new Date());
  $("#stat-total").textContent = total;
  $("#stat-pending").textContent = pending;
  $("#stat-completed").textContent = completed;
  $("#nav-all").textContent = total;
  $("#nav-today").textContent = state.tasks.filter((task) => task.due_date === today && !task.is_completed).length;
  const progress = total ? Math.round((completed / total) * 100) : 0;
  $("#progress-value").textContent = `${progress}%`;
  $("#progress-bar").style.width = `${progress}%`;
  $("#progress-caption").textContent = total ? `${completed} of ${total} tasks completed.` : "Every little step counts.";

  const headings = { all: "All tasks", today: "Today", upcoming: "Upcoming", completed: "Completed" };
  $("#task-list-title").firstChild.textContent = `${headings[state.filter]} `;
  const tasks = filteredTasks();
  $("#visible-count").textContent = tasks.length;
  $("#task-list").replaceChildren(...tasks.map(createTaskCard));
  const isEmpty = tasks.length === 0;
  $("#empty-state").hidden = !isEmpty;
  $("#empty-title").textContent = state.search ? "No matches just yet" : state.filter === "completed" ? "Nothing checked off yet" : "A fresh start";
  $("#empty-copy").textContent = state.search ? "Try another search to find the task you're looking for." : state.filter === "today" ? "No tasks due today. Enjoy a little breathing room." : state.filter === "upcoming" ? "Nothing coming up. Add a task whenever you're ready." : "Your list is clear. Add a task and make today yours.";
}

function createTaskCard(task) {
  const card = document.createElement("article");
  card.className = `task-card${task.is_completed ? " is-completed" : ""}`;
  const checkbox = document.createElement("button");
  checkbox.type = "button";
  checkbox.className = `task-check${task.is_completed ? " checked" : ""}`;
  checkbox.setAttribute("aria-label", task.is_completed ? "Mark as not completed" : "Mark as completed");
  checkbox.textContent = task.is_completed ? "✓" : "";
  checkbox.addEventListener("click", () => updateTask(task.id, { is_completed: !task.is_completed }, task.is_completed ? "Task marked as in progress." : "Nice work! Task completed."));

  const copy = document.createElement("div");
  copy.className = "task-copy";
  const title = document.createElement("h3");
  title.className = "task-title";
  title.textContent = task.title;
  copy.append(title);
  if (task.description) {
    const description = document.createElement("p");
    description.className = "task-description";
    description.textContent = task.description;
    copy.append(description);
  }

  const meta = document.createElement("div");
  meta.className = "task-meta";
  const category = document.createElement("span");
  category.className = `task-chip category-${task.category.toLowerCase()}`;
  category.textContent = task.category;
  const priority = document.createElement("span");
  priority.className = `task-chip priority-chip priority-${task.priority.toLowerCase()}`;
  priority.textContent = task.priority;
  meta.append(category, priority);
  if (task.due_date) {
    const due = document.createElement("span");
    due.className = `task-due${task.due_date < localDateString(new Date()) && !task.is_completed ? " overdue" : ""}`;
    due.textContent = formatDueDate(task.due_date);
    meta.append(due);
  }

  const actions = document.createElement("div");
  actions.className = "task-actions";
  const edit = document.createElement("button");
  edit.type = "button";
  edit.className = "icon-button";
  edit.title = "Edit task";
  edit.setAttribute("aria-label", `Edit ${task.title}`);
  edit.textContent = "✎";
  edit.addEventListener("click", () => openTaskModal(task));
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "icon-button";
  remove.title = "Delete task";
  remove.setAttribute("aria-label", `Delete ${task.title}`);
  remove.textContent = "×";
  remove.addEventListener("click", () => deleteTask(task));
  actions.append(edit, remove);
  card.append(checkbox, copy, meta, actions);
  return card;
}

function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDueDate(dateValue) {
  const [year, month, day] = dateValue.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(year, month - 1, day));
}

function openTaskModal(task = null) {
  state.editingId = task?.id ?? null;
  const form = $("#task-form");
  form.reset();
  if (task) {
    form.elements.title.value = task.title;
    form.elements.description.value = task.description || "";
    form.elements.category.value = task.category;
    form.elements.priority.value = task.priority;
    form.elements.due_date.value = task.due_date ? task.due_date.slice(0, 10) : "";
  } else {
    form.elements.category.value = "School";
    form.elements.priority.value = "Medium";
  }
  $("#modal-title").textContent = task ? "Edit task" : "Add a task";
  $("#task-submit").innerHTML = task ? 'Save changes <span aria-hidden="true">→</span>' : 'Save task <span aria-hidden="true">→</span>';
  hideNotice($("#task-form-message"));
  $("#task-modal").hidden = false;
  form.elements.title.focus();
}

function closeTaskModal() {
  $("#task-modal").hidden = true;
  state.editingId = null;
}

async function submitTask(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form).entries());
  const payload = {
    title: String(values.title || "").trim(),
    description: String(values.description || "").trim(),
    category: values.category,
    priority: values.priority,
    due_date: values.due_date || null
  };
  if (!payload.title || payload.title.length > 150) return showNotice($("#task-form-message"), "Judul wajib diisi dan maksimal 150 karakter.");
  if (payload.description.length > 5000) return showNotice($("#task-form-message"), "Deskripsi maksimal 5000 karakter.");
  if (!["School", "Personal", "Others"].includes(payload.category) || !["Low", "Medium", "High"].includes(payload.priority)) return showNotice($("#task-form-message"), "Kategori atau prioritas tidak valid.");
  const button = $("#task-submit");
  button.disabled = true;
  button.textContent = "Saving...";
  try {
    if (state.editingId) {
      await request(`/tasks/${state.editingId}`, { method: "PUT", body: JSON.stringify(payload) });
      showToast("Task updated.");
    } else {
      await request("/tasks", { method: "POST", body: JSON.stringify(payload) });
      showToast("Task added to your list.");
    }
    closeTaskModal();
    await loadTasks();
  } catch (error) {
    if (!state.token) return;
    showNotice($("#task-form-message"), error.message);
  } finally {
    button.disabled = false;
    button.innerHTML = state.editingId ? 'Save changes <span aria-hidden="true">→</span>' : 'Save task <span aria-hidden="true">→</span>';
  }
}

async function updateTask(id, changes, message) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  try {
    await request(`/tasks/${id}`, { method: "PUT", body: JSON.stringify({ title: task.title, description: task.description, category: task.category, priority: task.priority, due_date: task.due_date, ...changes }) });
    await loadTasks();
    showToast(message);
  } catch (error) {
    if (state.token) showToast(error.message);
  }
}

async function deleteTask(task) {
  if (!window.confirm(`Hapus tugas "${task.title}"? Tindakan ini tidak dapat dibatalkan.`)) return;
  try {
    await request(`/tasks/${task.id}`, { method: "DELETE" });
    await loadTasks();
    showToast("Task deleted.");
  } catch (error) {
    if (state.token) showToast(error.message);
  }
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2800);
}

function bindEvents() {
  $("#auth-form").addEventListener("submit", submitAuth);
  $("#auth-switch").addEventListener("click", () => setAuthMode($("#auth-form").dataset.mode === "login" ? "register" : "login"));
  document.querySelectorAll("[data-filter]").forEach((button) => button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    document.querySelectorAll("[data-filter]").forEach((item) => item.classList.toggle("active", item === button));
    renderTasks();
  }));
  document.querySelectorAll("[data-open-task]").forEach((button) => button.addEventListener("click", () => openTaskModal()));
  $("#task-search").addEventListener("input", (event) => {
    state.search = event.target.value.trim();
    renderTasks();
  });
  $("#task-form").addEventListener("submit", submitTask);
  $("#modal-close").addEventListener("click", closeTaskModal);
  $("#modal-cancel").addEventListener("click", closeTaskModal);
  $("#task-modal").addEventListener("click", (event) => { if (event.target === $("#task-modal")) closeTaskModal(); });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !$("#task-modal").hidden) closeTaskModal();
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      $("#task-search").focus();
    }
  });
  $("#logout-button").addEventListener("click", () => {
    clearSession();
    showAuth();
    showToast("You have been logged out.");
  });
}

bindEvents();
if (state.token && state.user) {
  showApp();
  loadTasks();
} else {
  clearSession();
  showAuth();
}
