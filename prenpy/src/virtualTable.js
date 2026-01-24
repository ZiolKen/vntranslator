export class VirtualTable {
  constructor({ container, rowHeight = 44, renderRow }) {
    this.container = container;
    this.rowHeight = rowHeight;
    this.renderRow = renderRow;
    this.items = [];
    this.pool = [];
    this.active = new Map();
    this.overscan = 8;

    this.spacer = document.createElement("div");
    this.spacer.style.position = "relative";
    this.spacer.style.width = "100%";
    this.container.innerHTML = "";
    this.container.appendChild(this.spacer);

    this.onScroll = this.onScroll.bind(this);
    this.container.addEventListener("scroll", this.onScroll, { passive: true });

    const ro = new ResizeObserver(() => this.onScroll());
    ro.observe(this.container);
  }

  setItems(items) {
    this.items = Array.isArray(items) ? items : [];
    this.spacer.style.height = (this.items.length * this.rowHeight) + "px";
    this.recycleAll();
    this.onScroll();
  }

  recycleAll() {
    for (const el of this.active.values()) this.pool.push(el);
    this.active.clear();
    this.spacer.replaceChildren();
  }

  takeNode() {
    const el = this.pool.pop() || document.createElement("div");
    return el;
  }

  onScroll() {
    const scrollTop = this.container.scrollTop;
    const height = this.container.clientHeight || 1;
    const start = Math.max(0, Math.floor(scrollTop / this.rowHeight) - this.overscan);
    const end = Math.min(this.items.length, Math.ceil((scrollTop + height) / this.rowHeight) + this.overscan);

    for (const [idx, el] of this.active.entries()) {
      if (idx < start || idx >= end) {
        this.active.delete(idx);
        this.pool.push(el);
        el.remove();
      }
    }

    for (let i = start; i < end; i++) {
      if (this.active.has(i)) continue;
      const el = this.takeNode();
      el.className = "row";
      el.style.top = (i * this.rowHeight) + "px";
      el.style.height = this.rowHeight + "px";
      this.renderRow(el, this.items[i], i);
      this.active.set(i, el);
      this.spacer.appendChild(el);
    }
  }

  scrollToIndex(index, align = "center") {
    const i = Math.max(0, Math.min(this.items.length - 1, index | 0));
    const rowTop = i * this.rowHeight;
    const rowBottom = rowTop + this.rowHeight;
    const viewTop = this.container.scrollTop;
    const viewBottom = viewTop + this.container.clientHeight;
    if (align === "start") this.container.scrollTop = rowTop;
    else if (align === "end") this.container.scrollTop = Math.max(0, rowBottom - this.container.clientHeight);
    else {
      if (rowTop < viewTop) this.container.scrollTop = rowTop - this.rowHeight * 2;
      else if (rowBottom > viewBottom) this.container.scrollTop = rowBottom - this.container.clientHeight + this.rowHeight * 2;
    }
  }
}
