(function() {
  'use strict';
  
  const DeepLClient = window.DeepLClient || (typeof require !== 'undefined' ? require('./deepl-client.js') : null);
  
  if (!DeepLClient) {
    console.error('[DeepL Integration] DeepLClient not found. Please include deepl-client.js first.');
  }
  
  let client = null;
  
  function getClient() {
    if (!client) {
      client = new DeepLClient({
        proxyUrl: '/api/deepl-trans',
        maxRetries: 3,
        timeout: 60000,
        useDirectFallback: true,
        debug: false,
        maxConcurrent: 2
      });
    }
    return client;
  }
  
  const LANG_MAP = {
    vi: { label: "Vietnamese", deepl: "VI" },
    id: { label: "Indonesian", deepl: "ID" },
    en: { label: "English", deepl: "EN-US" },
    ms: { label: "Malay", deepl: "MS" },
    tl: { label: "Filipino", deepl: "TL" },
    ja: { label: "Japanese", deepl: "JA" },
    ko: { label: "Korean", deepl: "KO" },
    zh: { label: "Chinese (Simplified)", deepl: "ZH" },
    th: { label: "Thai", deepl: "TH" },
    hi: { label: "Hindi", deepl: "HI" },
    fr: { label: "French", deepl: "FR" },
    de: { label: "German", deepl: "DE" },
    es: { label: "Spanish", deepl: "ES" },
    pt: { label: "Portuguese", deepl: "PT-PT" },
    ru: { label: "Russian", deepl: "RU" },
    ar: { label: "Arabic", deepl: "AR" }
  };
  
  function toDeepLTargetLang(langCode) {
    return LANG_MAP[langCode]?.deepl || null;
  }
  
  function needsDeepLQualityModel(dlTarget) {
    const qualityLangs = ['EN', 'EN-US', 'EN-GB', 'DE', 'FR', 'ES', 'PT-PT', 'PT-BR'];
    return qualityLangs.includes(dlTarget);
  }
  
  /**
   * @param {Array<string>} linesSafe
   * @param {string} targetLang
   * @param {string} apiKey
   * @param {AbortSignal} signal
   * @returns {Promise<Array<string>>} Translated texts
   */
  async function translateDeepLBatch(linesSafe, targetLang, apiKey, signal = null) {
    if (!Array.isArray(linesSafe) || linesSafe.length === 0) {
      throw new Error('linesSafe must be a non-empty array');
    }
    
    if (!targetLang) {
      throw new Error('targetLang is required');
    }
    
    if (!apiKey) {
      throw new Error('apiKey is required');
    }
    
    const dlTarget = toDeepLTargetLang(targetLang);
    if (!dlTarget) {
      throw new Error(`DeepL does not support target language "${targetLang}" in this tool.`);
    }
    
    console.log(`[DeepL] Translating ${linesSafe.length} lines to ${dlTarget}`);
    
    try {
      const deeplClient = getClient();
      
      const options = {
        preserve_formatting: 1,
        split_sentences: 0,
        signal
      };
      
      if (needsDeepLQualityModel(dlTarget)) {
        options.model_type = 'quality_optimized';
      }
      
      const startTime = Date.now();
      
      const result = await deeplClient.translate({
        apiKey,
        text: linesSafe,
        target_lang: dlTarget,
        options
      });
      
      const duration = Date.now() - startTime;
      console.log(`[DeepL] Translation completed in ${duration}ms`);
      
      if (!result.translations || !Array.isArray(result.translations)) {
        throw new Error('Invalid response format from DeepL');
      }
      
      const translations = result.translations.map(t => t.text || '');
      
      if (translations.length !== linesSafe.length) {
        throw new Error(
          `Translation count mismatch: expected ${linesSafe.length}, got ${translations.length}`
        );
      }
      
      return translations;
      
    } catch (error) {
      console.error('[DeepL] Translation failed:', error);
      
      let enhancedMessage = 'DeepL translation failed';
      
      if (error.status === 403) {
        enhancedMessage = 'Invalid DeepL API key or insufficient permissions';
      } else if (error.status === 456) {
        enhancedMessage = 'DeepL API quota exceeded';
      } else if (error.status === 429) {
        enhancedMessage = 'Too many requests. Please wait and try again';
      } else if (error.status >= 500) {
        enhancedMessage = 'DeepL service temporarily unavailable';
      } else if (error.message) {
        enhancedMessage = error.message;
      }
      
      const enhancedError = new Error(enhancedMessage);
      enhancedError.originalError = error;
      enhancedError.status = error.status;
      
      throw enhancedError;
    }
  }
  
  function initDeepL(options = {}) {
    client = new DeepLClient({
      proxyUrl: options.proxyUrl || '/api/deepl-trans',
      maxRetries: options.maxRetries || 3,
      timeout: options.timeout || 60000,
      useDirectFallback: options.useDirectFallback !== false,
      debug: options.debug || false,
      maxConcurrent: options.maxConcurrent || 2
    });
    
    console.log('[DeepL] Integration initialized');
    
    return client;
  }
  
  async function testDeepLConnection(apiKey) {
    try {
      const result = await translateDeepLBatch(
        ['Hello'],
        'vi',
        apiKey
      );
      
      return {
        success: true,
        message: 'DeepL connection successful',
        translation: result[0]
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
        error
      };
    }
  }
  
  const DeepLIntegration = {
    translateDeepLBatch,
    initDeepL,
    testDeepLConnection,
    toDeepLTargetLang,
    needsDeepLQualityModel,
    getClient
  };
  
  if (typeof window !== 'undefined') {
    window.DeepLIntegration = DeepLIntegration;
    window.translateDeepLBatch = translateDeepLBatch;
    window.initDeepL = initDeepL;
  }
  
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = DeepLIntegration;
  }
  
})();
