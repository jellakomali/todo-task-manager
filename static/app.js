const API_URL = "/api/tasks";
const state = { status: "all", priority: "all", search: "", date: "", page: 1, pageSize: 10, tasks: [] };

const rows = document.getElementById("taskRows");
const dialog = document.getElementById("taskDialog");
const form = document.getElementById("taskForm");
const notice = document.getElementById("notice");

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function moneylessDueState(task) {
  return task.status !== "completed" && task.deadline && task.deadline < new Date().toISOString().slice(0, 10);
}

function showNotice(message = "", isError = false) {
  notice.textContent = message;
  notice.classList.toggle("error", isError);
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || "Request failed. Please try again.");
  return data;
}

async function loadTasks() {
  showNotice();
  const params = new URLSearchParams({ status: state.status, priority: state.priority, q: state.search });
  try {
    const tasks = await request(`${API_URL}?${params}`);
    state.tasks = state.date ? tasks.filter(task => task.deadline === state.date) : tasks;
    state.page = Math.min(state.page, Math.max(1, Math.ceil(state.tasks.length / state.pageSize)));
    renderTasks();
  } catch (error) {
    rows.innerHTML = `<tr><td colspan="6" class="empty-state">${escapeHtml(error.message)}</td></tr>`;
    showNotice("Could not connect to the task server.", true);
  }
}

function renderSummary(tasks) {
  document.getElementById("totalCount").textContent = tasks.length;
  document.getElementById("pendingCount").textContent = tasks.filter(task => task.status === "pending").length;
  document.getElementById("completedCount").textContent = tasks.filter(task => task.status === "completed").length;
  document.getElementById("overdueCount").textContent = tasks.filter(moneylessDueState).length;
}

function renderTasks() {
  renderSummary(state.tasks);
  const startIndex = (state.page - 1) * state.pageSize;
  const pageTasks = state.tasks.slice(startIndex, startIndex + state.pageSize);

  if (pageTasks.length === 0) {
    rows.innerHTML = `<tr><td colspan="6" class="empty-state">No tasks found. Create a task to get started.</td></tr>`;
  } else {
    rows.innerHTML = pageTasks.map(task => {
      const overdue = moneylessDueState(task);
      const statusLabel = task.status === "completed" ? "Completed" : "Pending";
      const priorityLabel = task.priority[0].toUpperCase() + task.priority.slice(1);
      const created = task.created_at ? formatDate(task.created_at.slice(0, 10)) : "—";
      return `<tr>
        <td><div class="task-name" title="${escapeHtml(task.title)}">${escapeHtml(task.title)}</div>${task.description ? `<small class="task-description" title="${escapeHtml(task.description)}">${escapeHtml(task.description)}</small>` : ""}</td>
        <td><span class="badge priority-${escapeHtml(task.priority)}">${priorityLabel}</span></td>
        <td><button class="badge status-${escapeHtml(task.status)} status-toggle" data-id="${task.id}" title="Click to change status">${statusLabel}</button></td>
        <td>${escapeHtml(created)}</td>
        <td>${escapeHtml(formatDate(task.deadline))}${overdue ? `<span class="overdue-label">Overdue</span>` : ""}</td>
        <td><div class="action-group">
          <button class="action-button view-task" data-id="${task.id}" aria-label="View task" title="View">⌕</button>
          <button class="action-button edit-task" data-id="${task.id}" aria-label="Edit task" title="Edit">✎</button>
          <button class="action-button delete delete-task" data-id="${task.id}" aria-label="Delete task" title="Delete">⌫</button>
        </div></td>
      </tr>`;
    }).join("");
  }

  const total = state.tasks.length;
  const from = total === 0 ? 0 : startIndex + 1;
  const to = Math.min(startIndex + state.pageSize, total);
  document.getElementById("pageSummary").textContent = `${total} task${total === 1 ? "" : "s"}`;
  document.getElementById("pageRange").textContent = `${from}–${to} of ${total}`;
  document.getElementById("previousPage").disabled = state.page <= 1;
  document.getElementById("nextPage").disabled = to >= total;
}

function resetForm() {
  form.reset();
  ["taskTitle", "taskDescription", "taskDeadline", "taskPriority", "taskStatus"].forEach(id => {
    document.getElementById(id).disabled = false;
  });
  document.getElementById("taskId").value = "";
  document.getElementById("formError").textContent = "";
  document.getElementById("taskPriority").value = "medium";
  document.getElementById("taskStatus").value = "pending";
  document.getElementById("statusField").hidden = false;
  document.getElementById("saveTaskButton").hidden = false;
  document.getElementById("dialogTitle").textContent = "Create a task";
}

function openCreateDialog() {
  resetForm();
  dialog.showModal();
  document.getElementById("taskTitle").focus();
}

function fillTaskForm(task, readOnly = false) {
  resetForm();
  document.getElementById("dialogTitle").textContent = readOnly ? "Task details" : "Edit task";
  document.getElementById("taskId").value = task.id;
  document.getElementById("taskTitle").value = task.title;
  document.getElementById("taskDescription").value = task.description;
  document.getElementById("taskDeadline").value = task.deadline;
  document.getElementById("taskPriority").value = task.priority;
  document.getElementById("taskStatus").value = task.status;
  if (readOnly) {
    ["taskTitle", "taskDescription", "taskDeadline", "taskPriority", "taskStatus"].forEach(id => {
      document.getElementById(id).disabled = true;
    });
    document.getElementById("saveTaskButton").hidden = true;
  }
  dialog.showModal();
}

async function loadTaskIntoDialog(id, readOnly = false) {
  try {
    const task = await request(`${API_URL}/${id}`);
    fillTaskForm(task, readOnly);
  } catch (error) {
    showNotice(error.message, true);
  }
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  const title = document.getElementById("taskTitle").value.trim();
  const errorElement = document.getElementById("formError");
  if (!title) {
    errorElement.textContent = "Please enter a task title.";
    document.getElementById("taskTitle").focus();
    return;
  }

  const id = document.getElementById("taskId").value;
  const payload = {
    title,
    description: document.getElementById("taskDescription").value.trim(),
    deadline: document.getElementById("taskDeadline").value,
    priority: document.getElementById("taskPriority").value,
    status: document.getElementById("taskStatus").value
  };
  try {
    await request(id ? `${API_URL}/${id}` : API_URL, {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(payload)
    });
    dialog.close();
    showNotice(id ? "Task updated." : "Task created.");
    state.page = 1;
    await loadTasks();
  } catch (error) {
    errorElement.textContent = error.message;
  }
});

rows.addEventListener("click", async event => {
  const button = event.target.closest("button[data-id]");
  if (!button) return;
  const id = button.dataset.id;
  try {
    if (button.classList.contains("edit-task")) return loadTaskIntoDialog(id);
    if (button.classList.contains("view-task")) return loadTaskIntoDialog(id, true);
    if (button.classList.contains("delete-task")) {
      const task = state.tasks.find(item => String(item.id) === id);
      if (!window.confirm(`Delete "${task?.title || "this task"}"?`)) return;
      await request(`${API_URL}/${id}`, { method: "DELETE" });
      showNotice("Task deleted.");
      return loadTasks();
    }
    if (button.classList.contains("status-toggle")) {
      const currentTask = state.tasks.find(item => String(item.id) === id);
      const nextStatus = currentTask.status === "completed" ? "pending" : "completed";
      await request(`${API_URL}/${id}`, { method: "PATCH", body: JSON.stringify({ status: nextStatus }) });
      showNotice(`Task marked ${nextStatus}.`);
      return loadTasks();
    }
  } catch (error) {
    showNotice(error.message, true);
  }
});

document.getElementById("createTaskButton").addEventListener("click", openCreateDialog);
document.getElementById("closeDialog").addEventListener("click", () => dialog.close());
document.getElementById("cancelDialog").addEventListener("click", () => dialog.close());
document.getElementById("filterButton").addEventListener("click", () => {
  state.priority = document.getElementById("priorityFilter").value;
  state.date = document.getElementById("dateFilter").value;
  state.page = 1;
  loadTasks();
});
document.querySelectorAll(".tab[data-status]").forEach(tab => tab.addEventListener("click", () => {
  document.querySelectorAll(".tab[data-status]").forEach(item => {
    item.classList.toggle("active", item === tab);
    item.setAttribute("aria-selected", item === tab ? "true" : "false");
  });
  state.status = tab.dataset.status;
  state.page = 1;
  loadTasks();
}));
document.getElementById("searchInput").addEventListener("input", event => {
  state.search = event.target.value.trim();
  state.page = 1;
  loadTasks();
});
document.getElementById("pageSize").addEventListener("change", event => {
  state.pageSize = Number(event.target.value);
  state.page = 1;
  renderTasks();
});
document.getElementById("previousPage").addEventListener("click", () => {
  if (state.page > 1) { state.page--; renderTasks(); }
});
document.getElementById("nextPage").addEventListener("click", () => {
  if (state.page * state.pageSize < state.tasks.length) { state.page++; renderTasks(); }
});
document.getElementById("themeToggle").addEventListener("click", () => document.body.classList.toggle("theme-dark"));
document.getElementById("taskTitle").addEventListener("input", () => {
  if (document.getElementById("taskTitle").value.trim()) document.getElementById("formError").textContent = "";
});

loadTasks();
