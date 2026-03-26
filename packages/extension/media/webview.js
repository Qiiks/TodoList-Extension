"use strict";
(() => {
  // src/ui/webview/main.ts
  (() => {
    const vscode = acquireVsCodeApi();
    let dragFrom = null;
    const toElement = (value) => value instanceof HTMLElement ? value : null;
    const renderMarkdown = (input) => {
      const backtick = String.fromCharCode(96);
      const codePattern = new RegExp(`${backtick}(.+?)${backtick}`, "g");
      const escaped = input.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>").replace(codePattern, "<code>$1</code>").replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');
      return escaped.replaceAll("\n", "<br/>");
    };
    const syncMarkdownViews = () => {
      const rendered = document.querySelectorAll("[data-md-rendered]");
      rendered.forEach((el) => {
        const todoId = el.getAttribute("data-md-rendered");
        if (!todoId) {
          return;
        }
        const selector = `[data-action="set-description"][data-todo-id="${todoId}"]`;
        const input = document.querySelector(selector);
        if (!input) {
          return;
        }
        el.innerHTML = renderMarkdown(input.value || "No description");
      });
    };
    window.addEventListener("message", (event) => {
      const message = event.data;
      if (message.type === "focus-quick-add") {
        const input = document.querySelector(".tt-quick-add-input");
        input?.focus();
        return;
      }
      if (message.type !== "render" || !message.sections) {
        return;
      }
      const { sections } = message;
      const status = document.getElementById("statusSection");
      const presence = document.getElementById("presenceSection");
      const options = document.getElementById("optionsSection");
      const search = document.getElementById("searchSection");
      const todos = document.getElementById("todoSection");
      const quickAdd = document.getElementById("quickAddSection");
      const activityHeader = document.getElementById("activityHeader");
      const activity = document.getElementById("activitySection");
      const emptyState = document.getElementById("emptyState");
      const authBanner = document.getElementById("authBanner");
      const repoText = document.getElementById("repoText");
      if (status) status.innerHTML = sections.status || "";
      if (presence) presence.innerHTML = sections.presence || "";
      if (options) options.innerHTML = sections.options || "";
      if (search) search.innerHTML = sections.search || "";
      if (todos) todos.innerHTML = sections.todos || "";
      if (quickAdd) quickAdd.innerHTML = sections.quickAdd || "";
      if (activityHeader) activityHeader.innerHTML = sections.activityHeader || "";
      if (activity) activity.innerHTML = sections.activity || "";
      if (emptyState) emptyState.innerHTML = sections.emptyState || "";
      if (authBanner) authBanner.innerHTML = sections.authBanner || "";
      if (repoText) repoText.textContent = sections.repoText || "";
      syncMarkdownViews();
    });
    document.addEventListener("submit", (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) {
        return;
      }
      if (form.matches('[data-action="quick-add"]')) {
        event.preventDefault();
        const titleInput = form.querySelector('[name="title"]');
        const priorityInput = form.querySelector('[name="priority"]');
        if (!titleInput || !priorityInput) {
          return;
        }
        const title = titleInput.value || "";
        const priority = priorityInput.value || "medium";
        vscode.postMessage({ action: "quick-add", title, priority });
        titleInput.value = "";
        return;
      }
      if (form.matches('[data-action="submit-comment"]')) {
        event.preventDefault();
        const todoId = form.getAttribute("data-todo-id");
        const textarea = form.querySelector('textarea[name="body"]');
        if (!todoId || !textarea) {
          return;
        }
        const body = textarea.value || "";
        vscode.postMessage({ action: "submit-comment", todoId, body });
        textarea.value = "";
      }
    });
    document.addEventListener("keydown", (event) => {
      const target = toElement(event.target);
      if (target?.matches(".tt-quick-add-input") && event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        const form = target.closest('form[data-action="quick-add"]');
        form?.requestSubmit();
      }
      if (event.key === "Escape") {
        document.querySelectorAll("[data-todo-expanded]").forEach((el) => {
          el.hidden = true;
        });
      }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === "T" || event.key === "t")) {
        event.preventDefault();
        const input = document.querySelector(".tt-quick-add-input");
        input?.focus();
      }
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && (event.key === "z" || event.key === "Z")) {
        event.preventDefault();
        vscode.postMessage({ action: "undo" });
      }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === "z" || event.key === "Z")) {
        event.preventDefault();
        vscode.postMessage({ action: "redo" });
      }
      const row = target?.closest(".tt-todo-row");
      if (row && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
        event.preventDefault();
        const rows = Array.from(document.querySelectorAll(".tt-todo-row"));
        const index = rows.indexOf(row);
        const next = event.key === "ArrowDown" ? rows[index + 1] : rows[index - 1];
        next?.focus();
      }
      if (row && (event.key === "Enter" || event.key === " ")) {
        if (target && ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName)) {
          return;
        }
        event.preventDefault();
        const todoId = row.getAttribute("data-todo-id");
        if (todoId) {
          vscode.postMessage({ action: "toggle-todo", todoId });
        }
      }
      if (row && event.key === "Delete") {
        event.preventDefault();
        const todoId = row.getAttribute("data-todo-id");
        if (!todoId) {
          return;
        }
        if (window.confirm("Delete this todo?")) {
          vscode.postMessage({ action: "delete-todo", todoId });
        }
      }
    });
    document.addEventListener("click", (event) => {
      const target = toElement(event.target);
      if (!target) {
        return;
      }
      const actionEl = target.closest("[data-action]");
      if (!actionEl) {
        return;
      }
      const action = actionEl.getAttribute("data-action");
      const todoId = actionEl.getAttribute("data-todo-id");
      if (action === "toggle-expand") {
        const expanded = document.querySelector(`[data-todo-expanded="${todoId}"]`);
        if (expanded) {
          expanded.hidden = !expanded.hidden;
        }
        return;
      }
      if (action === "delete-todo" && todoId) {
        if (window.confirm("Delete this todo?")) {
          vscode.postMessage({ action: "delete-todo", todoId });
        }
        return;
      }
      if (action === "activity-next" || action === "activity-prev" || action === "toggle-show-completed" || action === "retry-now" || action === "refresh" || action === "sign-in" || action === "sign-out" || action === "switch-repo" || action === "export-markdown" || action === "undo" || action === "redo" || action === "toggle-activity") {
        vscode.postMessage({ action });
        return;
      }
      if (action === "toggle-todo" && todoId) {
        const checkbox = actionEl;
        if (checkbox.type === "checkbox") {
          vscode.postMessage({ action: "toggle-todo", todoId, checked: checkbox.checked });
        }
        return;
      }
      if (action === "add-checklist-item" && todoId) {
        const input = document.querySelector(`[data-checklist-input="${todoId}"]`);
        if (!input) {
          return;
        }
        vscode.postMessage({ action: "add-checklist-item", todoId, text: input.value || "" });
        input.value = "";
      }
    });
    document.addEventListener("change", (event) => {
      const target = toElement(event.target);
      if (!target) {
        return;
      }
      if (target.matches('[data-action="filter-change"]')) {
        const input = target;
        vscode.postMessage({ action: "filter-change", name: target.getAttribute("name"), value: input.value || "" });
        return;
      }
      if (target.matches('[data-action="set-priority"]')) {
        const select = target;
        vscode.postMessage({ action: "set-priority", todoId: target.getAttribute("data-todo-id"), priority: select.value || "medium" });
        return;
      }
      if (target.matches('[data-action="set-assignee"]')) {
        const select = target;
        vscode.postMessage({ action: "set-assignee", todoId: target.getAttribute("data-todo-id"), assignee: select.value || "" });
        return;
      }
      if (target.matches('[data-action="toggle-checklist-item"]')) {
        const checkbox = target;
        vscode.postMessage({
          action: "toggle-checklist-item",
          todoId: target.getAttribute("data-todo-id"),
          checklistId: target.getAttribute("data-checklist-id"),
          completed: Boolean(checkbox.checked)
        });
      }
    });
    document.addEventListener("input", (event) => {
      const target = toElement(event.target);
      if (!target) {
        return;
      }
      if (target.matches('[data-action="set-description"]')) {
        const textarea = target;
        vscode.postMessage({ action: "set-description", todoId: target.getAttribute("data-todo-id"), description: textarea.value || "" });
        syncMarkdownViews();
      }
      if (target.matches('[data-action="set-labels"]')) {
        const input = target;
        vscode.postMessage({ action: "set-labels", todoId: target.getAttribute("data-todo-id"), labels: input.value || "" });
      }
    });
    document.addEventListener("dragstart", (event) => {
      const target = toElement(event.target);
      if (!target) {
        return;
      }
      const row = target.closest(".tt-todo-row");
      if (!row) {
        return;
      }
      dragFrom = Number(row.getAttribute("data-order-index"));
      event.dataTransfer?.setData("text/plain", String(dragFrom));
      event.dataTransfer?.setDragImage(row, 8, 8);
    });
    document.addEventListener("dragover", (event) => {
      const target = toElement(event.target);
      if (!target) {
        return;
      }
      const row = target.closest(".tt-todo-row");
      if (!row) {
        return;
      }
      event.preventDefault();
      row.classList.add("tt-drag-over");
    });
    document.addEventListener("dragleave", (event) => {
      const target = toElement(event.target);
      if (!target) {
        return;
      }
      const row = target.closest(".tt-todo-row");
      if (!row) {
        return;
      }
      row.classList.remove("tt-drag-over");
    });
    document.addEventListener("drop", (event) => {
      const target = toElement(event.target);
      if (!target) {
        return;
      }
      const row = target.closest(".tt-todo-row");
      if (!row) {
        return;
      }
      event.preventDefault();
      row.classList.remove("tt-drag-over");
      const to = Number(row.getAttribute("data-order-index"));
      const from = typeof dragFrom === "number" ? dragFrom : Number(event.dataTransfer?.getData("text/plain"));
      if (Number.isFinite(from) && Number.isFinite(to)) {
        vscode.postMessage({ action: "reorder", from, to });
      }
      dragFrom = null;
    });
    vscode.postMessage({ action: "webview-ready" });
  })();
})();
