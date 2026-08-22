const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_END = 0x06054b50;

const encoder = new TextEncoder();

function u16(v){ return new Uint8Array([v & 255, (v >>> 8) & 255]); }
function u32(v){ return new Uint8Array([v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]); }

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function dosTimeDate(d = new Date()){
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = d.getHours();
  const mins = d.getMinutes();
  const secs = Math.floor(d.getSeconds() / 2);
  const dosTime = (hours << 11) | (mins << 5) | secs;
  const dosDate = ((Math.max(1980, year) - 1980) << 9) | (month << 5) | day;
  return { dosTime, dosDate };
}

function concat(parts){
  const len = parts.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export function buildZip(files) {
  const entries = [];
  let offset = 0;
  const { dosTime, dosDate } = dosTimeDate();

  for (const f of files) {
    const nameBytes = encoder.encode(f.name);
    const data = f.data instanceof Uint8Array ? f.data : encoder.encode(String(f.data ?? ''));
    const crc = crc32(data);
    const flags = 0x0800;
    const method = 0;

    const local = concat([
      u32(SIG_LOCAL),
      u16(20),
      u16(flags),
      u16(method),
      u16(dosTime),
      u16(dosDate),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
      data
    ]);

    entries.push({ nameBytes, data, crc, method, flags, dosTime, dosDate, localOffset: offset, localSize: local.length });
    offset += local.length;
  }

  const centralParts = [];
  for (const e of entries) {
    centralParts.push(concat([
      u32(SIG_CENTRAL),
      u16(20),
      u16(20),
      u16(e.flags),
      u16(e.method),
      u16(e.dosTime),
      u16(e.dosDate),
      u32(e.crc),
      u32(e.data.length),
      u32(e.data.length),
      u16(e.nameBytes.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(e.localOffset),
      e.nameBytes
    ]));
  }

  const central = concat(centralParts);
  const centralOffset = offset;
  offset += central.length;

  const end = concat([
    u32(SIG_END),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(central.length),
    u32(centralOffset),
    u16(0),
  ]);

  const locals = entries.map(e => concat([ ]));
  const localAll = concat(entries.map(e => {
    const nameBytes = e.nameBytes;
    const data = e.data;
    const crc = e.crc;
    const flags = e.flags;
    const method = e.method;
    return concat([
      u32(SIG_LOCAL),
      u16(20),
      u16(flags),
      u16(method),
      u16(e.dosTime),
      u16(e.dosDate),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
      data
    ]);
  }));

  return concat([localAll, central, end]);
}

export function downloadZip(name, files) {
  const buf = buildZip(files);
  const blob = new Blob([buf], { type: 'application/zip' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 0);
}
