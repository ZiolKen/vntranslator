export function qs(sel, root = document) { return root.querySelector(sel); }
export function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

export function el(tag, attrs = null, ...kids) {
  const n = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "style") n.setAttribute("style", v);
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else if (v === true) n.setAttribute(k, "");
    else if (v != null) n.setAttribute(k, String(v));
  }
  for (const kid of kids.flat()) {
    if (kid == null) continue;
    if (kid.nodeType) n.appendChild(kid);
    else n.appendChild(document.createTextNode(String(kid)));
  }
  return n;
}

export function debounce(fn, ms = 150) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

export function detectEol(text) {
  const s = String(text || "");
  const crlf = (s.match(/\r\n/g) || []).length;
  const lf = (s.match(/(?<!\r)\n/g) || []).length;
  return crlf >= lf ? "\r\n" : "\n";
}

export function downloadTextFile(name, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
}

export function toast(title, msg, ms = 2600) {
  const root = document.getElementById("toastRoot");
  root.className = "toastwrap";
  const t = el("div", { class: "toast" },
    el("div", { class: "toast-title" }, title),
    el("div", { class: "toast-msg" }, msg)
  );
  root.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

export function modal({ title, body, onClose, actions }) {
  const root = document.getElementById("modalRoot");
  const overlay = el("div", { class: "modal-overlay" });
  const m = el("div", { class: "modal" });
  const head = el("div", { class: "modal-head" },
    el("div", { class: "modal-title" }, title),
    el("button", { class: "iconbtn", onclick: () => close() }, "×")
  );
  const b = el("div", { class: "modal-body" }, body);
  const foot = el("div", { class: "modal-foot" }, actions || []);
  m.append(head, b, foot);
  overlay.appendChild(m);
  root.appendChild(overlay);

  function close() {
    overlay.remove();
    onClose && onClose();
  }

  overlay.addEventListener("click", e => { if (e.target === overlay) close(); });
  window.addEventListener("keydown", escHandler, { once: true });

  function escHandler(e) {
    if (e.key === "Escape") close();
    else window.addEventListener("keydown", escHandler, { once: true });
  }

  return { close, overlay, modal: m };
}

export function formatPct(n) {
  const v = Math.max(0, Math.min(1, Number(n || 0)));
  return Math.round(v * 100) + "%";
}

export function shorten(s, n = 140) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  return t.slice(0, Math.max(0, n - 1)).trim() + "…";
}

export function nowIso() {
  return new Date().toISOString();
}

export function stableId() {
  const a = crypto.getRandomValues(new Uint8Array(16));
  const hex = Array.from(a).map(x => x.toString(16).padStart(2, "0")).join("");
  return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) + "-" + hex.slice(16, 20) + "-" + hex.slice(20);
}
