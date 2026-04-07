(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VNKAGParserCore = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const LUA_CMD_BLACKLIST = new Set(['name', 'ruby', 'rt2', 'savetitle', 'bg', 'bgm', 'se', 'fg', 'msgoff', 'extrans', 'select', 'cinema']);
  const RGX_ASSET_FILE = /\.(png|jpe?g|gif|bmp|webp|ogg|mp3|wav|m4a|mp4|webm|m4v|avi|mov|ttf|otf|woff2?|eot|ks|ast|asb|txt|json)$/i;
  const RGX_ASSET_PATH = /(?:^|['"])\s*(?:images?|audio|music|voice|bg|bgm|se|sfx|movie|video|sounds?|scenario)\//i;
  const ARTEMIS_LOCALE_SUFFIXES = ['ja', 'en', 'cn', 'tw'];

  function normalizeNewlines(text) {
    return String(text == null ? '' : text).replace(/\r\n?/g, '\n');
  }

  function escapeQuoted(text, quote) {
    const q = quote === "'" ? "'" : '"';
    return String(text == null ? '' : text)
      .replace(/\\/g, '\\\\')
      .replace(q === '"' ? /"/g : /'/g, '\\' + q)
      .replace(/\r\n?|\n/g, '\\n');
  }

  function looksLikeCodeOrAsset(text) {
    const t = String(text || '').trim();
    if (!t) return true;
    if (/^\d+$/.test(t)) return true;
    if (/^[^\p{L}\p{N}]+$/u.test(t)) return true;
    if (RGX_ASSET_FILE.test(t)) return true;
    if (RGX_ASSET_PATH.test(t)) return true;
    if (/^(?:[A-Za-z_][\w.-]*\/)+[A-Za-z_][\w.-]*$/.test(t)) return true;
    if (/^(?:[A-Za-z_][\w.-]*\\)+[A-Za-z_][\w.-]*$/.test(t)) return true;
    if (/^\\[A-Za-z]+(?:\[[^\]]*\])?$/.test(t)) return true;
    if (/^%\d*\$?[sdfox]/i.test(t)) return true;
    if (/^[A-Z0-9_:-]{2,}$/.test(t) && !/[\u3040-\u30ff\u3400-\u9fff]/.test(t)) return true;
    if (/^(?:true|false|null|undefined|none)$/i.test(t)) return true;
    if (/^(?:[a-z_][a-z0-9_]*)(?:\.[a-z_][a-z0-9_]*)*$/.test(t) && t.length >= 4) return true;
    return false;
  }

  function isTranslatableText(text) {
    const t = String(text || '').trim();
    if (!t) return false;
    if (looksLikeCodeOrAsset(t)) return false;
    if (LUA_CMD_BLACKLIST.has(t.toLowerCase())) return false;
    if (/^(?:return|break|continue|if|else|elsif|while|for|function|var|const|let|switch|case|default)$/i.test(t)) return false;
    return /[\p{L}]/u.test(t);
  }

  function detectScriptType(filename, bufferOrText) {
    const name = String(filename || '').toLowerCase();
    const text = typeof bufferOrText === 'string'
      ? bufferOrText
      : (bufferOrText && typeof bufferOrText.toString === 'function' ? bufferOrText.toString('utf8') : '');

    if (name.endsWith('.json')) return 'rpgmv-json';
    if (name.endsWith('.rpy')) return 'renpy-script';
    if (name.endsWith('.ast') || name.endsWith('.asb')) return 'artemis-ast';
    if (name.endsWith('.ks')) return 'kag-ks';
    if (name.endsWith('.txt')) {
      if (/\b(?:text|mw|ruby|title|name)(?:_(?:ja|en|cn|tw))?\s*=\s*["']/.test(text) || /\b(?:ja|en|cn|tw)\s*=\s*\{/.test(text)) return 'artemis-ast';
      if (/^@(?:if|endif|jump|call|return|wait|wt|eval|emb|set)\b/im.test(text)) return 'kag-ks';
      if (/^\*[A-Za-z0-9_\-|]+$/m.test(text)) return 'kag-ks';
      if (/「[^」]+」/.test(text)) return 'kag-ks';
      if (/\[(?:l|r|np|cm|er|emb|cname|eval|ruby)(?:\s|\])/i.test(text)) return 'kag-ks';
    }
    return 'unknown';
  }

  function extractKAGTextAndMapping(source) {
    const lines = normalizeNewlines(source).split('\n');
    const out = [];
    const mapping = [];
    let inIscript = false;
    let inMacro = false;
    let inIgnore = false;
    let inHtml = false;
    let macroDialogs = [];

    function isGarbage(txt) {
      if (!txt) return true;
      const t = String(txt).trim();
      return (
        t === '' ||
        /^;+/.test(t) ||
        /^\*[a-zA-Z0-9_\|]+$/.test(t) ||
        /^\[(?!.*(?:text|name|caption|title)=)[a-zA-Z0-9_]+(?:\s+[^\]]*)?(?:\s*\/)?]$/.test(t) ||
        /^@.+/.test(t) ||
        /^【.*?】$/.test(t) ||
        /^「§」$/.test(t) ||
        /^§$/.test(t) ||
        /^[\[\]{}()]+$/.test(t) ||
        /^[=><+\-*\/!]+$/.test(t) ||
        /^#\d+$/.test(t) ||
        /^[0-9]+$/.test(t) ||
        /^(?:return|break|continue|if|else|elsif|while|for|function|var|const|let|true|false|null|undefined)$/i.test(t) ||
        /^\s*(?:var|const|let|if|else|elsif|switch|case|default|for|while|do|function)\s/i.test(t) ||
        !isTranslatableText(t)
      );
    }

    function push(text, data) {
      if (isGarbage(text)) return;
      const value = String(text);
      if (inMacro) {
        macroDialogs.push({ text: value, mapping: data });
      } else {
        out.push(value);
        mapping.push(data);
      }
    }

    function extractTagAttributes(lineIndex, raw, trimmed) {
      let any = false;
      const attrCounters = Object.create(null);
      trimmed.replace(/\b(text|name|caption|title)\s*=\s*(["'])((?:(?!\2).|\\.)*)\2/gi, function (_, attr, quote, value) {
        const attrName = String(attr).toLowerCase();
        const occurrence = attrCounters[attrName] || 0;
        attrCounters[attrName] = occurrence + 1;
        push(value, {
          lineIndex,
          original: raw,
          extractType: 'attr',
          attributeName: attrName,
          occurrence,
          quoteType: quote,
        });
        any = true;
        return _;
      });
      return any;
    }

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const t = raw.trim();
      if (/^\[iscript\]/i.test(t)) { inIscript = true; continue; }
      if (/^\[endscript\]/i.test(t)) { inIscript = false; continue; }
      if (/^\[ignore\b/i.test(t)) { inIgnore = true; continue; }
      if (/^\[endignore\]/i.test(t)) { inIgnore = false; continue; }
      if (/^\[html\]/i.test(t)) { inHtml = true; continue; }
      if (/^\[endhtml\]/i.test(t)) { inHtml = false; continue; }
      if (inIscript || inIgnore || inHtml) continue;
      if (/^\[macro\b/i.test(t)) { inMacro = true; macroDialogs = []; continue; }
      if (/^\[endmacro\]/i.test(t)) {
        inMacro = false;
        macroDialogs.forEach(function (item) {
          out.push(item.text);
          mapping.push(item.mapping);
        });
        macroDialogs = [];
        continue;
      }
      if (!t || /^;/.test(t)) continue;

      let extracted = false;

      const evalMatch = t.match(/@eval\s+exp=(sf|tf|f)\.(name\w*|hnam\w*)=(["'])((?:(?!\3).|\\.)*)\3/i);
      if (evalMatch) {
        push(evalMatch[4], {
          lineIndex: i,
          original: raw,
          extractType: 'eval_name',
          quoteType: evalMatch[3],
          varPath: evalMatch[1] + '.' + evalMatch[2],
        });
        extracted = true;
      }
      if (extracted) continue;

      const embMatch = t.match(/\[emb\s+exp=(["'])(sf|tf|f)\.(name\w*|hnam\w*)\1\]/i);
      if (embMatch) {
        const afterEmb = t.replace(/\[emb[^\]]*\]/gi, '').trim();
        if (!isGarbage(afterEmb)) {
          const pos = raw.indexOf(afterEmb);
          push(afterEmb, {
            lineIndex: i,
            original: raw,
            extractType: 'center_text',
            prefix: pos >= 0 ? raw.slice(0, pos) : '',
            suffix: pos >= 0 ? raw.slice(pos + afterEmb.length) : '',
          });
          extracted = true;
        }
      }
      if (extracted) continue;

      if (/^\[[a-zA-Z0-9_]+(?:\s+[^\]]+)?]$/.test(t) || /^\[[a-zA-Z0-9_]+(?:\s+[^\]]+)?]/.test(t)) {
        extracted = extractTagAttributes(i, raw, t);
      }
      if (extracted) continue;

      const jpQuotes = [...t.matchAll(/「([^」]+)」/g)];
      if (jpQuotes.length) {
        jpQuotes.forEach(function (match, idx) {
          push(match[1], {
            lineIndex: i,
            original: raw,
            extractType: 'jp_quote',
            quoteIndex: idx,
          });
        });
        continue;
      }

      const wrappedName = t.match(/【([^】]+)】/);
      if (wrappedName && !isGarbage(wrappedName[1])) {
        push(wrappedName[1], {
          lineIndex: i,
          original: raw,
          extractType: 'wrapped_name',
        });
        const remainder = t.replace(/【([^】]+)】/g, '').replace(/\[(?:np|l|r|cm|er)\]/gi, '').trim();
        if (!isGarbage(remainder)) {
          const pos = raw.indexOf(remainder);
          push(remainder, {
            lineIndex: i,
            original: raw,
            extractType: 'center_text',
            prefix: pos >= 0 ? raw.slice(0, pos) : '',
            suffix: pos >= 0 ? raw.slice(pos + remainder.length) : '',
          });
        }
        continue;
      }

      if (/^\[cname\s/i.test(t)) {
        const afterCname = t.replace(/^\[cname\s+[^\]]+\]/i, '').replace(/\[(?:np|l|r|cm|er)\]/gi, '').trim();
        if (!isGarbage(afterCname)) {
          const pos = raw.indexOf(afterCname);
          push(afterCname, {
            lineIndex: i,
            original: raw,
            extractType: 'center_text',
            prefix: pos >= 0 ? raw.slice(0, pos) : '',
            suffix: pos >= 0 ? raw.slice(pos + afterCname.length) : '',
          });
          continue;
        }
      }

      const plainText = t.replace(/\[(?:l|r|np|cm|er)\]/gi, '').trim();
      if (plainText && !/^\[/.test(plainText) && !/^[@*;#]/.test(plainText) && /[\u3000-\u9FFF\u3040-\u309F\u30A0-\u30FF]|[A-Za-z]{3,}/.test(plainText) && !isGarbage(plainText)) {
        const pos = raw.indexOf(plainText);
        push(plainText, {
          lineIndex: i,
          original: raw,
          extractType: 'center_text',
          prefix: pos >= 0 ? raw.slice(0, pos) : '',
          suffix: pos >= 0 ? raw.slice(pos + plainText.length) : '',
        });
      }
    }

    return { lines: out, mapping: mapping };
  }

  function insertKAGTextBack(source, newLines, mapping) {
    const lines = normalizeNewlines(source).split('\n');

    function replaceAttrByOccurrence(line, attrName, targetOccurrence, quoteType, newText) {
      let occurrence = -1;
      const rx = new RegExp('\\b(' + attrName + ')\\s*=\\s*(["\'])((?:(?!\\2).|\\\\.)*)\\2', 'gi');
      return line.replace(rx, function (match, attr, quote) {
        occurrence += 1;
        if (occurrence !== targetOccurrence) return match;
        const q = quoteType || quote;
        return attr + '=' + q + escapeQuoted(newText, q) + q;
      });
    }

    mapping.forEach(function (m, idx) {
      const newText = newLines[idx];
      if (typeof newText !== 'string') return;
      const line = lines[m.lineIndex];
      if (line == null) return;
      switch (m.extractType) {
        case 'jp_quote': {
          let jpCount = -1;
          lines[m.lineIndex] = line.replace(/「([^」]+)」/g, function (match) {
            jpCount += 1;
            return jpCount === m.quoteIndex ? '「' + newText + '」' : match;
          });
          break;
        }
        case 'attr': {
          lines[m.lineIndex] = replaceAttrByOccurrence(line, m.attributeName, m.occurrence, m.quoteType, newText);
          break;
        }
        case 'eval_name': {
          const q = m.quoteType || '"';
          const rx = new RegExp('@eval\\s+exp=' + String(m.varPath || '').replace('.', '\\.') + '=' + q + '[^' + q + ']*' + q, 'i');
          lines[m.lineIndex] = line.replace(rx, '@eval exp=' + m.varPath + '=' + q + escapeQuoted(newText, q) + q);
          break;
        }
        case 'wrapped_name': {
          lines[m.lineIndex] = line.replace(/【([^】]+)】/, '【' + newText + '】');
          break;
        }
        case 'center_text': {
          lines[m.lineIndex] = (m.prefix || '') + newText + (m.suffix || '');
          break;
        }
      }
    });

    return lines.join('\n');
  }

  function getArtemisAttrRegex() {
    return /\b(text|mw|ruby|title|name)(?:_(ja|en|cn|tw))?\s*=\s*(["'])((?:(?!\3).|\\.)*)\3/gi;
  }

  function getArtemisSelectRegex() {
    return /\bselect(?:_(ja|en|cn|tw))?\s*=\s*\{/gi;
  }

  function getArtemisLocaleRegex() {
    return /\b(ja|en|cn|tw)\s*=\s*\{/gi;
  }

  function findMatchingBrace(text, openIndex) {
    let depth = 0;
    let inString = false;
    let quoteChar = '';
    let escaped = false;
    for (let i = openIndex; i < text.length; i += 1) {
      const ch = text[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (inString) {
        if (ch === quoteChar) {
          inString = false;
          quoteChar = '';
        }
        continue;
      }
      if (ch === '"' || ch === "'") {
        inString = true;
        quoteChar = ch;
        continue;
      }
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) return i;
      }
    }
    return -1;
  }

  function extractBalancedAssignments(text, regex) {
    const blocks = [];
    let match;
    regex.lastIndex = 0;
    while ((match = regex.exec(text)) !== null) {
      const whole = match[0];
      const openIndex = match.index + whole.lastIndexOf('{');
      const end = findMatchingBrace(text, openIndex);
      if (end === -1) continue;
      blocks.push({ start: match.index, bodyStart: openIndex + 1, end, content: text.slice(match.index, end + 1) });
      regex.lastIndex = end + 1;
    }
    return blocks;
  }

  function overlaps(ranges, start, end) {
    return ranges.some(function (range) {
      return start < range.end && end > range.start;
    });
  }

  function collectArtemisTextOccurrences(source) {
    const text = normalizeNewlines(source);
    const occurrences = [];
    const occupied = [];
    let match;

    const attrRx = getArtemisAttrRegex();
    while ((match = attrRx.exec(text)) !== null) {
      const quote = match[3];
      const value = match[4];
      if (!isTranslatableText(value)) continue;
      const valueStart = match.index + match[0].lastIndexOf(value);
      const valueEnd = valueStart + value.length;
      occurrences.push({ start: valueStart, end: valueEnd, value, quote, type: 'attr' });
      occupied.push({ start: valueStart, end: valueEnd });
    }

    extractBalancedAssignments(text, getArtemisSelectRegex()).forEach(function (block) {
      const blockText = text.slice(block.bodyStart, block.end);
      const strRx = /(["'])((?:(?!\1).|\\.)*)\1/g;
      let m;
      while ((m = strRx.exec(blockText)) !== null) {
        const value = m[2];
        if (!isTranslatableText(value)) continue;
        const start = block.bodyStart + m.index + 1;
        const end = start + value.length;
        if (overlaps(occupied, start, end)) continue;
        occurrences.push({ start, end, value, quote: m[1], type: 'select' });
        occupied.push({ start, end });
      }
    });

    extractBalancedAssignments(text, getArtemisLocaleRegex()).forEach(function (block) {
      const blockText = text.slice(block.bodyStart, block.end);
      const strRx = /(["'])((?:(?!\1).|\\.)*)\1/g;
      let m;
      while ((m = strRx.exec(blockText)) !== null) {
        const value = m[2];
        if (!isTranslatableText(value)) continue;
        const before = blockText.slice(0, m.index).trimEnd();
        if (/\b[A-Za-z_][\w.]*\s*=\s*$/.test(before)) continue;
        const start = block.bodyStart + m.index + 1;
        const end = start + value.length;
        if (overlaps(occupied, start, end)) continue;
        occurrences.push({ start, end, value, quote: m[1], type: 'block' });
        occupied.push({ start, end });
      }
    });

    occurrences.sort(function (a, b) { return a.start - b.start; });
    return occurrences;
  }

  function extractArtemisTextAndMapping(source) {
    const occurrences = collectArtemisTextOccurrences(source);
    return {
      lines: occurrences.map(function (item) { return item.value; }),
      mapping: occurrences.map(function (item) {
        return { start: item.start, end: item.end, quote: item.quote, type: item.type };
      })
    };
  }

  function insertArtemisTextBack(source, newLines, mapping) {
    let text = normalizeNewlines(source);
    const replacements = [];
    (mapping || []).forEach(function (item, idx) {
      const value = newLines[idx];
      if (typeof value !== 'string') return;
      replacements.push({ start: item.start, end: item.end, value, quote: item.quote || '"' });
    });
    replacements.sort(function (a, b) { return b.start - a.start; });
    replacements.forEach(function (item) {
      text = text.slice(0, item.start) + escapeQuoted(item.value, item.quote) + text.slice(item.end);
    });
    return text;
  }

  return {
    detectScriptType,
    escapeQuoted,
    extractKAGTextAndMapping,
    insertKAGTextBack,
    collectArtemisTextOccurrences,
    extractArtemisTextAndMapping,
    insertArtemisTextBack,
  };
});
