export const $ = (id) => document.getElementById(id);

export const on = (el, ev, fn, opts) => {
  if (!el) return () => {};
  el.addEventListener(ev, fn, opts);
  return () => el.removeEventListener(ev, fn, opts);
};

export const setText = (el, text) => { if (el) el.textContent = String(text ?? ""); };

export const setDisabled = (el, v) => { if (el) el.disabled = Boolean(v); };

export const show = (el) => { if (el) el.classList.remove("hidden"); };

export const hide = (el) => { if (el) el.classList.add("hidden"); };

export const isTextField = (el) => el && (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && el.type !== "checkbox" && el.type !== "button" && el.type !== "submit"));
