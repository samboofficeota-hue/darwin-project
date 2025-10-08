/**
 * 統一されたHTTPクライアント
 * タイムアウト、リトライ、エラーハンドリング機能付き
 */

import { getConfig } from './config.js';

const config = getConfig();

/**
 * リトライ設定のデフォルト値
 */
const DEFAULT_RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffFactor: 2,
  retryCondition: (error, response) => {
    // ネットワークエラーまたは5xx、429エラーの場合にリトライ
    if (error) {
      return error.name === 'AbortError' || 
             error.code === 'ENOTFOUND' || 
             error.code === 'ECONNREFUSED' ||
             error.message.includes('fetch');
    }
    if (response) {
      return response.status === 429 || 
             response.status >= 500 || 
             response.status === 502 || 
             response.status === 503 || 
             response.status === 504;
    }
    return false;
  }
};

/**
 * タイムアウト付きfetch
 */
export async function fetchWithTimeout(url, options = {}, timeout = config.api.timeout) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeout}ms`);
    }
    throw error;
  }
}

/**
 * リトライ機能付きfetch
 */
export async function fetchWithRetry(url, options = {}, retryConfig = {}) {
  const finalRetryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
  const { maxRetries, baseDelay, maxDelay, backoffFactor, retryCondition } = finalRetryConfig;

  let lastError = null;
  let lastResponse = null;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      console.log(`HTTP request attempt ${attempt}/${maxRetries + 1} to ${url}`);
      
      const response = await fetchWithTimeout(url, options, options.timeout || config.api.timeout);
      
      // 成功またはリトライ不要なエラーの場合
      if (response.ok || !retryCondition(null, response)) {
        return response;
      }

      lastResponse = response;
      
      // 最後の試行の場合はリトライしない
      if (attempt > maxRetries) {
        break;
      }

      // レート制限の場合は特別な待機時間を使用
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const rateLimitReset = response.headers.get('X-RateLimit-Reset');
        
        let delay;
        if (retryAfter) {
          delay = Math.min(parseInt(retryAfter) * 1000, maxDelay);
        } else if (rateLimitReset) {
          const resetTime = new Date(rateLimitReset).getTime();
          const currentTime = Date.now();
          delay = Math.min(Math.max(resetTime - currentTime, baseDelay), maxDelay);
        } else {
          delay = Math.min(baseDelay * Math.pow(backoffFactor, attempt - 1), maxDelay);
        }
        
        console.log(`Rate limited. Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        // 指数バックオフ
        const delay = Math.min(baseDelay * Math.pow(backoffFactor, attempt - 1), maxDelay);
        console.log(`Request failed with status ${response.status}. Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

    } catch (error) {
      lastError = error;
      
      // 最後の試行またはリトライ不要なエラーの場合
      if (attempt > maxRetries || !retryCondition(error, null)) {
        throw error;
      }

      // 指数バックオフ
      const delay = Math.min(baseDelay * Math.pow(backoffFactor, attempt - 1), maxDelay);
      console.log(`Request error: ${error.message}. Waiting ${delay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // すべてのリトライが失敗した場合
  if (lastResponse) {
    return lastResponse;
  } else if (lastError) {
    throw lastError;
  } else {
    throw new Error(`Request failed after ${maxRetries + 1} attempts`);
  }
}

/**
 * Vimeo API専用のHTTPクライアント
 */
export class VimeoAPIClient {
  constructor() {
    this.baseURL = 'https://api.vimeo.com';
    this.accessToken = config.vimeo.accessToken;
    this.retryConfig = config.vimeo.rateLimit;
  }

  async request(endpoint, options = {}) {
    if (!this.accessToken) {
      throw new Error('Vimeo access token not configured');
    }

    const url = `${this.baseURL}${endpoint}`;
    const requestOptions = {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Accept': `application/vnd.vimeo.*+json;version=${config.vimeo.apiVersion}`,
        'User-Agent': config.vimeo.userAgent,
        ...options.headers
      }
    };

    const response = await fetchWithRetry(url, requestOptions, this.retryConfig);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new VimeoAPIError(response.status, errorText, endpoint);
    }

    return response;
  }

  async getVideo(videoId) {
    const response = await this.request(`/videos/${videoId}`);
    return response.json();
  }

  async getVideoFiles(videoId) {
    const response = await this.request(`/videos/${videoId}/files`);
    return response.json();
  }
}

/**
 * Google Cloud Speech API専用のクライアント
 */
export class SpeechAPIClient {
  constructor() {
    this.retryConfig = {
      maxRetries: 3,
      baseDelay: 2000,
      maxDelay: 60000,
      retryCondition: (error, response) => {
        // Google Cloud APIの場合、特定のエラーコードでリトライ
        if (error) {
          return error.code === 'UNAVAILABLE' || 
                 error.code === 'DEADLINE_EXCEEDED' ||
                 error.code === 'RESOURCE_EXHAUSTED' ||
                 error.name === 'AbortError';
        }
        return false;
      }
    };
  }

  async transcribeWithRetry(speechClient, request) {
    const { maxRetries, baseDelay, maxDelay, backoffFactor = 2 } = this.retryConfig;
    
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        console.log(`Speech API attempt ${attempt}/${maxRetries + 1}`);
        
        // タイムアウト付きでSpeech APIを呼び出し
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Speech API timeout')), 300000); // 5分タイムアウト
        });

        const [operation] = await Promise.race([
          speechClient.longRunningRecognize(request),
          timeoutPromise
        ]);

        console.log('Speech operation started:', operation.name);
        
        // 結果の待機（タイムアウト付き）
        const resultPromise = operation.promise();
        const resultTimeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Speech operation timeout')), 600000); // 10分タイムアウト
        });

        const [response] = await Promise.race([
          resultPromise,
          resultTimeoutPromise
        ]);

        return response;

      } catch (error) {
        console.error(`Speech API attempt ${attempt} failed:`, error);
        
        // 最後の試行またはリトライ不要なエラーの場合
        if (attempt > maxRetries || !this.retryConfig.retryCondition(error, null)) {
          throw error;
        }

        // 指数バックオフ
        const delay = Math.min(baseDelay * Math.pow(backoffFactor, attempt - 1), maxDelay);
        console.log(`Waiting ${delay}ms before Speech API retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
}

/**
 * Vimeo APIエラークラス
 */
export class VimeoAPIError extends Error {
  constructor(status, message, endpoint) {
    super(`Vimeo API Error: ${status} - ${message}`);
    this.name = 'VimeoAPIError';
    this.status = status;
    this.endpoint = endpoint;
    this.isRetryable = status === 429 || status >= 500;
  }
}

/**
 * 汎用的なAPIクライアント
 */
export class APIClient {
  constructor(baseURL, defaultHeaders = {}) {
    this.baseURL = baseURL;
    this.defaultHeaders = defaultHeaders;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const requestOptions = {
      ...options,
      headers: {
        ...this.defaultHeaders,
        ...options.headers
      }
    };

    return fetchWithRetry(url, requestOptions);
  }

  async get(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'GET' });
  }

  async post(endpoint, data, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      body: JSON.stringify(data)
    });
  }
}

/**
 * 並列リクエストの実行（制限付き）
 */
export async function executeParallel(requests, concurrency = 3) {
  const results = [];
  const executing = [];

  for (const request of requests) {
    const promise = request().then(result => {
      executing.splice(executing.indexOf(promise), 1);
      return result;
    });

    results.push(promise);
    executing.push(promise);

    if (executing.length >= concurrency) {
      await Promise.race(executing);
    }
  }

  return Promise.allSettled(results);
}

export default {
  fetchWithTimeout,
  fetchWithRetry,
  VimeoAPIClient,
  SpeechAPIClient,
  APIClient,
  executeParallel
};
