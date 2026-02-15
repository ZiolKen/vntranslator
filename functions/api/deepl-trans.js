const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW = 60000;
const MAX_REQUESTS_PER_MINUTE = 100;

function checkRateLimit(apiKey) {
  const now = Date.now();
  const key = apiKey.substring(0, 8);
  
  if (!rateLimitStore.has(key)) {
    rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return { allowed: true, remaining: MAX_REQUESTS_PER_MINUTE - 1 };
  }
  
  const record = rateLimitStore.get(key);
  
  if (now >= record.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return { allowed: true, remaining: MAX_REQUESTS_PER_MINUTE - 1 };
  }
  
  if (record.count >= MAX_REQUESTS_PER_MINUTE) {
    const resetIn = Math.ceil((record.resetAt - now) / 1000);
    return { 
      allowed: false, 
      remaining: 0,
      resetIn,
      message: `Rate limit exceeded. Resets in ${resetIn}s`
    };
  }
  
  record.count++;
  return { allowed: true, remaining: MAX_REQUESTS_PER_MINUTE - record.count };
}

function validateRequest(body) {
  const errors = [];
  
  if (!body.apiKey || typeof body.apiKey !== "string") {
    errors.push("Missing or invalid apiKey");
  }
  
  if (body.text == null) {
    errors.push("Missing text field");
  } else if (typeof body.text === "string") {
    if (body.text.length === 0) {
      errors.push("Text cannot be empty");
    }
    if (body.text.length > 50000) {
      errors.push("Text too long (max 50000 characters)");
    }
  } else if (Array.isArray(body.text)) {
    if (body.text.length === 0) {
      errors.push("Text array cannot be empty");
    }
    if (body.text.length > 50) {
      errors.push("Too many text items (max 50)");
    }
    if (!body.text.every(t => typeof t === "string")) {
      errors.push("All text array items must be strings");
    }
  } else {
    errors.push("Text must be string or array of strings");
  }
  
  if (!body.target_lang || typeof body.target_lang !== "string") {
    errors.push("Missing or invalid target_lang");
  }
  
  return errors;
}

async function callDeepLAPI(baseUrl, apiKey, deeplBody, timeoutMs = 60000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(baseUrl + "/v2/translate", {
      method: "POST",
      headers: {
        "Authorization": "DeepL-Auth-Key " + apiKey,
        "Content-Type": "application/json",
        "User-Agent": "VNTranslator/2.0"
      },
      body: JSON.stringify(deeplBody),
      signal: controller.signal,
    });
    
    clearTimeout(timeout);
    
    const responseText = await response.text();
    
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      text: responseText,
      headers: Object.fromEntries(response.headers.entries())
    };
    
  } catch (err) {
    clearTimeout(timeout);
    
    if (err.name === "AbortError") {
      throw new Error("Request timeout");
    }
    
    throw err;
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
  
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  
  if (req.method !== "POST") {
    return res.status(405).json({ 
      error: "Method not allowed",
      message: "This endpoint only accepts POST requests",
      allowedMethods: ["POST", "OPTIONS"]
    });
  }
  
  const startTime = Date.now();
  
  try {
    const body = typeof req.body === "string" 
      ? JSON.parse(req.body) 
      : (req.body || {});
    
    const validationErrors = validateRequest(body);
    if (validationErrors.length > 0) {
      return res.status(400).json({ 
        error: "Validation failed",
        details: validationErrors 
      });
    }
    
    const { apiKey, ...deeplBody } = body;
    const trimmedKey = apiKey.trim();
    
    const rateLimit = checkRateLimit(trimmedKey);
    res.setHeader("X-RateLimit-Limit", MAX_REQUESTS_PER_MINUTE);
    res.setHeader("X-RateLimit-Remaining", rateLimit.remaining);
    
    if (!rateLimit.allowed) {
      res.setHeader("X-RateLimit-Reset", rateLimit.resetIn);
      return res.status(429).json({
        error: "Rate limit exceeded",
        message: rateLimit.message,
        retryAfter: rateLimit.resetIn
      });
    }
    
    const isFreeKey = trimmedKey.endsWith(":fx");
    const baseUrl = isFreeKey 
      ? "https://api-free.deepl.com"
      : "https://api.deepl.com";
    
    console.log(`[DeepL] Request to ${baseUrl} (${isFreeKey ? 'free' : 'pro'} key)`);
    
    let lastError = null;
    const maxRetries = 3;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await callDeepLAPI(baseUrl, trimmedKey, deeplBody, 60000);
        
        console.log(`[DeepL] Attempt ${attempt}: Status ${result.status}`);
        
        if (!result.ok) {
          if (result.status === 403) {
            return res.status(403).json({
              error: "Authentication failed",
              message: "Invalid API key or insufficient permissions",
              deeplStatus: result.status
            });
          }
          
          if (result.status === 456) {
            return res.status(456).json({
              error: "Quota exceeded",
              message: "Your DeepL API quota has been exceeded",
              deeplStatus: result.status
            });
          }
          
          if (result.status === 429) {
            if (attempt < maxRetries) {
              const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
              console.log(`[DeepL] Rate limited, retrying in ${backoffMs}ms...`);
              await new Promise(resolve => setTimeout(resolve, backoffMs));
              continue;
            }
            
            return res.status(429).json({
              error: "Too many requests",
              message: "DeepL rate limit exceeded. Please try again later.",
              deeplStatus: result.status
            });
          }
          
          if (result.status >= 500) {
            if (attempt < maxRetries) {
              const backoffMs = Math.min(2000 * Math.pow(2, attempt - 1), 15000);
              console.log(`[DeepL] Server error ${result.status}, retrying in ${backoffMs}ms...`);
              await new Promise(resolve => setTimeout(resolve, backoffMs));
              continue;
            }
            
            return res.status(502).json({
              error: "DeepL service unavailable",
              message: "DeepL service is temporarily unavailable",
              deeplStatus: result.status,
              details: result.text.substring(0, 500)
            });
          }
          
          return res.status(result.status).json({
            error: "DeepL API error",
            message: result.statusText || "Request failed",
            deeplStatus: result.status,
            details: result.text.substring(0, 500)
          });
        }
        
        const elapsedMs = Date.now() - startTime;
        console.log(`[DeepL] Success in ${elapsedMs}ms`);
        
        res.setHeader("Content-Type", "application/json");
        res.setHeader("X-Response-Time", elapsedMs);
        return res.status(200).send(result.text);
        
      } catch (err) {
        lastError = err;
        
        if (err.message === "Request timeout") {
          if (attempt < maxRetries) {
            console.log(`[DeepL] Timeout on attempt ${attempt}, retrying...`);
            continue;
          }
          
          return res.status(504).json({
            error: "Gateway timeout",
            message: "Request to DeepL timed out after multiple attempts"
          });
        }
        
        if (attempt < maxRetries) {
          const backoffMs = 1000 * attempt;
          console.log(`[DeepL] Network error, retrying in ${backoffMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
          continue;
        }
      }
    }
    
    throw lastError || new Error("All retry attempts failed");
    
  } catch (err) {
    console.error("[DeepL] Fatal error:", err);
    
    const elapsedMs = Date.now() - startTime;
    
    return res.status(500).json({
      error: "Internal server error",
      message: "An unexpected error occurred",
      details: err.message,
      timestamp: new Date().toISOString(),
      elapsed: elapsedMs
    });
  }
}