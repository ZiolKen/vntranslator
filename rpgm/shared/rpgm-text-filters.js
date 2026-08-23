/**
 * RpgmTextFilters — shared "is this actually dialogue?" heuristics for
 * RPG Maker MV/MZ text extraction.
 *
 * The original rpgm.js only had a single crude check (must contain a
 * letter, and escape-code characters must be <40% of the string). That
 * let a lot of non-dialogue values through as "translatable text":
 *   - bare identifiers/switches copy-pasted into a comment ("bossHP_1")
 *   - plugin note-tag style tokens ("ATK_UP", "party.member")
 *   - RPG Maker "counter" UI strings that are almost all escape codes
 *     with only a slash or a unit character left after stripping codes
 *     (e.g. "(\V[12]/99)", "(残り1個)")
 *   - JS-looking script fragments accidentally captured as comments
 *
 * This module ports the more advanced filtering already proven in the
 * RPGM Ultimate tool (rpgmu/rpgmux.js) into a small, dependency-free
 * shape so the base RPG Maker tool (rpgm.js) can reuse the exact same
 * logic instead of a weaker inline copy - one implementation, so a
 * future improvement benefits both tools instead of drifting apart.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.RpgmTextFilters = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const RE = {
    numeric: /^[+-]?\d+(?:\.\d+)?$/,
    range: /^\d+\s*-\s*\d+$/,
    fileExt: /\.(png|jpg|jpeg|js|html|css|otf|ttf|webp|ogg|m4a|mp3|wav|gif|mp4|webm|avi|woff|woff2|eot|svg|mov|json)$/i,
    varLike: /^[A-Za-z_][A-Za-z0-9_]*$/,
    pathLike: /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)+$/,
    allCapsCmd: /^[A-Z][A-Z0-9_]+(\s|$)/,
    keyValue: /^\w+\s*:\s*.+$/,
    rpgVar: /\\[VvNnPp]\[\d+\]/g,
    rpgColor: /\\[Cc]\[\d+\]/g,
    rpgIcon: /\\[Ii]\[\d+\]/g,
    rpgGold: /\\[Gg]/g,
    rpgOneChar: /\\[{}<>|.^!]/g,
    rpgBracket: /\\\w+\[[^\]]*\]/g,
    rpgWord: /\\\w+/g,
    spaces: /[ \t\u3000]+/g,
  };

  function stripRpgTextCodesForCheck(s) {
    let t = String(s ?? '');
    t = t.replace(RE.rpgVar, '');
    t = t.replace(RE.rpgColor, '');
    t = t.replace(RE.rpgIcon, '');
    t = t.replace(RE.rpgGold, '');
    t = t.replace(RE.rpgOneChar, '');
    t = t.replace(RE.rpgBracket, '');
    t = t.replace(RE.rpgWord, '');
    t = t.replace(RE.spaces, '');
    return t;
  }

  function isControlOnlyLine(s) {
    return stripRpgTextCodesForCheck(s).length === 0;
  }

  function looksLikeJsCodeLine(s) {
    const t = String(s ?? '').trim();
    if (!t) return false;
    if (/^(?:var|let|const)\s+[A-Za-z_$][\w$]*/.test(t)) return true;
    if (/^(?:if|for|while|switch)\s*\(/.test(t)) return true;
    if (/[{};]/.test(t)) return true;
    if (/\$game[A-Za-z_]\w*/.test(t)) return true;
    if (/[=]/.test(t) && /[A-Za-z_$][\w$]*\s*\.\s*[A-Za-z_$][\w$]*/.test(t)) return true;
    if (/\w\s*\([^)]*\)\s*;?$/.test(t) && /[=.$]/.test(t)) return true;
    return false;
  }

  function looksLikeLooseIdToken(s) {
    const t = String(s ?? '').trim();
    if (t.length < 2 || t.length > 24) return false;
    if (!/^[A-Za-z0-9_-]+$/.test(t)) return false;
    if (t === t.toLowerCase()) return true;
    if (/\d$/.test(t)) return true;
    if (/[A-Z]/.test(t) && /[a-z]/.test(t)) return true;
    if (/[-_]/.test(t)) return true;
    return false;
  }

  // e.g. "(\V[12]/99)", "(残り1個)" - a counter/progress readout, not dialogue.
  function looksLikeUiCounterLine(s) {
    const raw = String(s ?? '');
    const t = raw.trim();
    if (!t) return true;
    const tt = t.replace(/[\u3000\s]/g, '');
    if (/^[（(].*[\\][Vv]\[\d+\].*[)）]$/.test(tt) && /\/\d+/.test(tt)) return true;

    let core = stripRpgTextCodesForCheck(t);
    core = core
      .replace(/[\u3000\s]/g, '')
      .replace(/[()（）［］【】\[\]{}<>「」『』、。・…‥:：;；\/\-\+＝=]/g, '')
      .replace(/\d+/g, '');

    if (core.length <= 1) return true;
    if (/^(?:枚|個|回|%|％)+$/.test(core)) return true;
    return false;
  }

  function looksLikeAssetOrCommandLine(s) {
    const t = String(s ?? '').trim();
    if (!t) return true;
    if (looksLikeJsCodeLine(t)) return true;
    if (looksLikeUiCounterLine(t)) return true;
    if (looksLikeLooseIdToken(t)) return true;
    if (RE.pathLike.test(t)) return true;
    if (RE.allCapsCmd.test(t)) return true;
    if (RE.keyValue.test(t)) return true;
    if (RE.numeric.test(t)) return true;
    if (RE.range.test(t)) return true;
    if (RE.fileExt.test(t)) return true;
    return false;
  }

  /**
   * Main entry point. `kind` tunes strictness:
   *  - 'speakerName' | 'dialogueText' | 'choice' | 'branch': permissive -
   *    these come from message/choice event params that RPG Maker only
   *    ever populates with author-written text, so we just need the
   *    baseline sanity checks (non-empty, contains a real letter, not
   *    mostly escape codes).
   *  - 'commentText' | 'pluginText' | 'name' (default): strict - these
   *    slots can also hold plugin note-tags, variable/switch names, or
   *    stray code, so run the fuller asset/command/id heuristics too.
   */
  function isValidDialogText(text, kind) {
    if (typeof text !== 'string') return false;
    const t = text.trim();
    if (!t) return false;
    // A single CJK/Kana/Hangul character is often a complete, meaningful
    // word on its own (choice text like "山", exclamations, etc.) - only
    // reject single-character strings when that lone character is NOT
    // an ideograph/kana/hangul (e.g. a stray "A", "1", "!").
    const isSingleWideChar = t.length === 1 && /[\u3040-\u30FF\u4E00-\u9FFF\uAC00-\uD7A3]/.test(t);
    if (t.length < 2 && !isSingleWideChar) return false;
    if (!/[A-Za-zÀ-ỹ\u00C0-\u1EF9\u3040-\u30FF\u4E00-\u9FFF]/.test(t)) return false;
    if (isControlOnlyLine(t)) return false;

    const tagRatio = (t.match(/<[^>]+>/g) || []).join('').length / t.length;
    if (tagRatio > 0.40) return false;

    const permissive = kind === 'speakerName' || kind === 'dialogueText' || kind === 'choice' || kind === 'branch';
    if (permissive) return true;

    if (looksLikeAssetOrCommandLine(t)) return false;
    if (looksLikeLooseIdToken(t)) return false;

    const core = stripRpgTextCodesForCheck(t);
    if (!core) return false;
    if (core.length <= 1 && /^[A-Za-z0-9]$/.test(core)) return false;

    return true;
  }

  return {
    isValidDialogText,
    isControlOnlyLine,
    looksLikeAssetOrCommandLine,
    looksLikeUiCounterLine,
    looksLikeLooseIdToken,
    looksLikeJsCodeLine,
    stripRpgTextCodesForCheck,
  };
});
