export const DEEPL_SUPPORTED_TARGETS = {
  'BG': 'Bulgarian',
  'CS': 'Czech',
  'DA': 'Danish',
  'DE': 'German',
  'EL': 'Greek',
  'EN': 'English',
  'EN-GB': 'English (British)',
  'EN-US': 'English (American)',
  'ES': 'Spanish',
  'ET': 'Estonian',
  'FI': 'Finnish',
  'FR': 'French',
  'HU': 'Hungarian',
  'ID': 'Indonesian',
  'IT': 'Italian',
  'JA': 'Japanese',
  'KO': 'Korean',
  'LT': 'Lithuanian',
  'LV': 'Latvian',
  'NB': 'Norwegian',
  'NL': 'Dutch',
  'PL': 'Polish',
  'PT': 'Portuguese',
  'PT-BR': 'Portuguese (Brazilian)',
  'PT-PT': 'Portuguese (European)',
  'RO': 'Romanian',
  'RU': 'Russian',
  'SK': 'Slovak',
  'SL': 'Slovenian',
  'SV': 'Swedish',
  'TR': 'Turkish',
  'UK': 'Ukrainian',
  'ZH': 'Chinese (Simplified)',
  'AR': 'Arabic',
  'HI': 'Hindi',
  'TH': 'Thai',
  'VI': 'Vietnamese',
  'MS': 'Malay',
  'TL': 'Filipino'
};

export const QUALITY_OPTIMIZED_LANGS = [
  'EN', 'EN-US', 'EN-GB',
  'DE', 'FR', 'ES', 
  'PT-PT', 'PT-BR'
];

export function isDeepLSupported(langCode) {
  if (!langCode) return false;
  const normalized = langCode.toUpperCase().trim();
  return normalized in DEEPL_SUPPORTED_TARGETS;
}

export function normalizeDeepLLang(langCode) {
  if (!langCode) return null;
  
  const normalized = langCode.toUpperCase().trim();
  
  if (normalized in DEEPL_SUPPORTED_TARGETS) {
    return normalized;
  }
  
  const base = normalized.split('-')[0];
  
  const mappings = {
    'EN': 'EN-US',
    'PT': 'PT-PT',
    'ZH': 'ZH',
    'VI': 'VI',
    'JA': 'JA',
    'KO': 'KO',
    'TH': 'TH',
    'ID': 'ID',
    'MS': 'MS',
    'TL': 'TL',
    'AR': 'AR',
    'HI': 'HI'
  };
  
  return mappings[base] || null;
}

export function shouldUseQualityModel(langCode) {
  if (!langCode) return false;
  const normalized = normalizeDeepLLang(langCode);
  return QUALITY_OPTIMIZED_LANGS.includes(normalized);
}

export function validateDeepLKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') {
    return { valid: false, error: 'API key must be a string' };
  }
  
  const trimmed = apiKey.trim();
  
  if (trimmed.length < 10) {
    return { valid: false, error: 'API key is too short' };
  }
  
  const isFree = trimmed.endsWith(':fx');
  const isPro = !isFree && trimmed.length > 20;
  
  if (!isFree && !isPro) {
    return { 
      valid: false, 
      error: 'Invalid key format. Free keys end with ":fx"' 
    };
  }
  
  return {
    valid: true,
    type: isFree ? 'free' : 'pro',
    key: trimmed
  };
}

export function estimateCharCount(text) {
  if (typeof text === 'string') {
    return text.length;
  }
  
  if (Array.isArray(text)) {
    return text.reduce((sum, t) => sum + (t?.length || 0), 0);
  }
  
  return 0;
}

export function splitIntoChunks(texts, maxChunkSize = 50) {
  if (!Array.isArray(texts)) {
    texts = [texts];
  }
  
  const chunks = [];
  
  for (let i = 0; i < texts.length; i += maxChunkSize) {
    chunks.push(texts.slice(i, i + maxChunkSize));
  }
  
  return chunks;
}

export function createDeepLRequest(params) {
  const {
    text,
    target_lang,
    source_lang = null,
    preserve_formatting = 1,
    split_sentences = 0,
    formality = null,
    glossary_id = null
  } = params;
  
  const normalizedTarget = normalizeDeepLLang(target_lang);
  
  if (!normalizedTarget) {
    throw new Error(`Unsupported target language: ${target_lang}`);
  }
  
  const body = {
    text,
    target_lang: normalizedTarget,
    preserve_formatting,
    split_sentences
  };
  
  if (source_lang) {
    body.source_lang = source_lang;
  }
  
  if (formality) {
    body.formality = formality;
  }
  
  if (glossary_id) {
    body.glossary_id = glossary_id;
  }
  
  if (shouldUseQualityModel(normalizedTarget)) {
    body.model_type = 'quality_optimized';
  }
  
  return body;
}

export function parseDeepLError(error) {
  const result = {
    message: 'Translation failed',
    code: 'UNKNOWN',
    retryable: false,
    details: null
  };
  
  if (!error) return result;
  
  if (error.status) {
    switch (error.status) {
      case 400:
        result.code = 'BAD_REQUEST';
        result.message = 'Invalid request parameters';
        break;
      case 403:
        result.code = 'AUTH_FAILED';
        result.message = 'Invalid API key';
        break;
      case 404:
        result.code = 'NOT_FOUND';
        result.message = 'Endpoint not found';
        break;
      case 413:
        result.code = 'REQUEST_TOO_LARGE';
        result.message = 'Request text too large';
        break;
      case 429:
        result.code = 'RATE_LIMIT';
        result.message = 'Too many requests';
        result.retryable = true;
        break;
      case 456:
        result.code = 'QUOTA_EXCEEDED';
        result.message = 'API quota exceeded';
        break;
      case 503:
        result.code = 'SERVICE_UNAVAILABLE';
        result.message = 'DeepL service temporarily unavailable';
        result.retryable = true;
        break;
      case 504:
        result.code = 'TIMEOUT';
        result.message = 'Request timeout';
        result.retryable = true;
        break;
      default:
        if (error.status >= 500) {
          result.code = 'SERVER_ERROR';
          result.message = 'DeepL server error';
          result.retryable = true;
        }
    }
  }
  
  if (error.message) {
    result.details = error.message;
  }
  
  if (error.details) {
    result.details = error.details;
  }
  
  return result;
}

export function formatTranslationResult(result) {
  if (!result) {
    return { translations: [], count: 0 };
  }
  
  const translations = Array.isArray(result.translations) 
    ? result.translations 
    : [];
  
  return {
    translations: translations.map(t => ({
      text: t.text || '',
      detectedSourceLang: t.detected_source_language || null
    })),
    count: translations.length,
    raw: result
  };
}

export function logTranslationMetrics(params) {
  const {
    charCount,
    duration,
    success,
    error,
    retries = 0
  } = params;
  
  const metrics = {
    timestamp: new Date().toISOString(),
    charCount,
    duration,
    charsPerSecond: duration > 0 ? Math.round(charCount / (duration / 1000)) : 0,
    success,
    retries
  };
  
  if (error) {
    metrics.error = error;
  }
  
  console.log('[DeepL Metrics]', metrics);
  
  return metrics;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DEEPL_SUPPORTED_TARGETS,
    QUALITY_OPTIMIZED_LANGS,
    isDeepLSupported,
    normalizeDeepLLang,
    shouldUseQualityModel,
    validateDeepLKey,
    estimateCharCount,
    splitIntoChunks,
    createDeepLRequest,
    parseDeepLError,
    formatTranslationResult,
    logTranslationMetrics
  };
}
