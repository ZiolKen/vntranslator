class DeepLClient {
  constructor(options = {}) {
    this.proxyUrl = options.proxyUrl || '/api/deepl-trans';
    this.maxRetries = options.maxRetries || 3;
    this.timeout = options.timeout || 60000;
    this.useDirectFallback = options.useDirectFallback !== false;
    this.debug = options.debug || false;
    
    this.activeRequests = 0;
    this.maxConcurrent = options.maxConcurrent || 5;
    this.requestQueue = [];
  }
  
  log(...args) {
    if (this.debug) {
      console.log('[DeepLClient]', ...args);
    }
  }
  
  error(...args) {
    console.error('[DeepLClient]', ...args);
  }

  validateApiKey(apiKey) {
    if (!apiKey || typeof apiKey !== 'string') {
      throw new Error('API key must be a non-empty string');
    }
    
    const trimmed = apiKey.trim();
    
    if (trimmed.length < 10) {
      throw new Error('API key appears to be invalid (too short)');
    }
    
    return trimmed;
  }

  getBaseUrl(apiKey) {
    return apiKey.endsWith(':fx') 
      ? 'https://api-free.deepl.com'
      : 'https://api.deepl.com';
  }

  createTimeoutController(timeoutMs) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    return {
      signal: controller.signal,
      clear: () => clearTimeout(timeoutId)
    };
  }
  
  async backoff(attempt, baseMs = 1000, maxMs = 15000) {
    const delayMs = Math.min(baseMs * Math.pow(2, attempt - 1), maxMs);
    const jitter = Math.random() * 200;
    await new Promise(resolve => setTimeout(resolve, delayMs + jitter));
  }
  
  async callViaProxy(apiKey, requestBody, signal) {
    this.log('Calling via proxy:', this.proxyUrl);
    
    const response = await fetch(this.proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        apiKey,
        ...requestBody
      }),
      signal
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      let errorData;
      
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }
      
      const error = new Error(
        errorData.message || 
        errorData.error || 
        `Proxy error: ${response.status} ${response.statusText}`
      );
      error.status = response.status;
      error.details = errorData;
      error.isProxyError = true;
      
      throw error;
    }
    
    return response.json();
  }
  
  async callDirectly(apiKey, requestBody, signal) {
    const baseUrl = this.getBaseUrl(apiKey);
    this.log('Calling directly:', baseUrl);
    
    const response = await fetch(`${baseUrl}/v2/translate`, {
      method: 'POST',
      headers: {
        'Authorization': `DeepL-Auth-Key ${apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'VNTranslator/2.0'
      },
      body: JSON.stringify(requestBody),
      signal
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      
      const error = new Error(
        `DeepL API error: ${response.status} ${response.statusText}`
      );
      error.status = response.status;
      error.details = errorText;
      error.isDeepLError = true;
      
      if (response.status === 403) {
        error.message = 'Invalid DeepL API key';
      } else if (response.status === 456) {
        error.message = 'DeepL quota exceeded';
      } else if (response.status === 429) {
        error.message = 'DeepL rate limit exceeded';
        error.retryable = true;
      } else if (response.status >= 500) {
        error.message = 'DeepL service unavailable';
        error.retryable = true;
      }
      
      throw error;
    }
    
    return response.json();
  }
  
  async executeWithRetry(apiKey, requestBody, options = {}) {
    const { signal } = options;
    let lastError = null;
    let usedProxy = false;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        this.log(`Attempt ${attempt}/${this.maxRetries}`);
        
        const timeoutCtrl = this.createTimeoutController(this.timeout);
        
        const combinedSignal = signal
          ? this.combineAbortSignals([signal, timeoutCtrl.signal])
          : timeoutCtrl.signal;
        
        let result;
        
        try {
          if (!usedProxy || attempt === 1) {
            try {
              result = await this.callViaProxy(apiKey, requestBody, combinedSignal);
              usedProxy = true;
              this.log('Proxy succeeded');
            } catch (proxyError) {
              this.log('Proxy failed:', proxyError.message);
              
              if (
                this.useDirectFallback && 
                (proxyError.status === 405 || 
                 proxyError.status === 404 ||
                 proxyError.message.includes('Failed to fetch') ||
                 proxyError.message.includes('Network'))
              ) {
                this.log('Falling back to direct API call');
                result = await this.callDirectly(apiKey, requestBody, combinedSignal);
              } else {
                throw proxyError;
              }
            }
          } else {
            result = await this.callDirectly(apiKey, requestBody, combinedSignal);
          }
          
          timeoutCtrl.clear();
          return result;
          
        } catch (err) {
          timeoutCtrl.clear();
          throw err;
        }
        
      } catch (err) {
        lastError = err;
        
        if (err.status === 403 || err.status === 456) {
          this.error('Non-retryable error:', err.message);
          throw err;
        }
        
        if (err.name === 'AbortError' && signal && signal.aborted) {
          this.log('Request aborted by user');
          throw new Error('Translation cancelled by user');
        }
        
        if (
          err.name === 'AbortError' ||
          err.retryable ||
          err.status === 429 ||
          err.status >= 500 ||
          err.message.includes('timeout') ||
          err.message.includes('network')
        ) {
          if (attempt < this.maxRetries) {
            this.log(`Retryable error, waiting before retry ${attempt + 1}...`);
            await this.backoff(attempt);
            continue;
          }
        }
        
        this.error('Request failed:', err.message);
        throw err;
      }
    }
    
    throw lastError || new Error('All retry attempts failed');
  }
  
  combineAbortSignals(signals) {
    const controller = new AbortController();
    
    for (const signal of signals) {
      if (signal) {
        signal.addEventListener('abort', () => controller.abort(), { once: true });
      }
    }
    
    return controller.signal;
  }
  
  async translate(params) {
    const { apiKey, text, target_lang, options = {} } = params;
    
    const validatedKey = this.validateApiKey(apiKey);
    
    if (!text) {
      throw new Error('Text parameter is required');
    }
    
    if (!target_lang) {
      throw new Error('target_lang parameter is required');
    }
    
    const requestBody = {
      text,
      target_lang,
      preserve_formatting: options.preserve_formatting ?? 1,
      split_sentences: options.split_sentences ?? 0,
      ...(options.source_lang && { source_lang: options.source_lang }),
      ...(options.formality && { formality: options.formality }),
      ...(options.model_type && { model_type: options.model_type })
    };
    
    this.log('Translation request:', {
      textCount: Array.isArray(text) ? text.length : 1,
      target: target_lang
    });
    
    return this.withPooling(() => 
      this.executeWithRetry(validatedKey, requestBody, options)
    );
  }

  async withPooling(fn) {
    while (this.activeRequests >= this.maxConcurrent) {
      await new Promise(resolve => {
        this.requestQueue.push(resolve);
      });
    }
    
    this.activeRequests++;
    
    try {
      return await fn();
    } finally {
      this.activeRequests--;
      
      if (this.requestQueue.length > 0) {
        const next = this.requestQueue.shift();
        next();
      }
    }
  }
  
  async translateBatch(params) {
    const { apiKey, texts, target_lang, options = {} } = params;
    
    if (!Array.isArray(texts)) {
      throw new Error('texts must be an array');
    }
    
    if (texts.length === 0) {
      return [];
    }
    
    const batchSize = options.batchSize || 50;
    const results = [];
    
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      
      const result = await this.translate({
        apiKey,
        text: batch,
        target_lang,
        options
      });
      
      if (result.translations) {
        results.push(...result.translations.map(t => t.text));
      }
    }
    
    return results;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = DeepLClient;
}

if (typeof window !== 'undefined') {
  window.DeepLClient = DeepLClient;
}