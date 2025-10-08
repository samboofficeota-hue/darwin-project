/**
 * セキュリティとプライバシー保護のユーティリティ
 * レート制限、入力検証、データ暗号化機能
 */

import crypto from 'crypto';
import { getConfig } from './config.js';

const config = getConfig();

/**
 * レート制限管理クラス
 */
export class RateLimiter {
  constructor() {
    this.requests = new Map(); // IP -> { count, resetTime }
    this.maxRequests = config.security.maxRequestsPerMinute;
    this.windowMs = 60 * 1000; // 1分
    
    // 定期的にクリーンアップ
    setInterval(() => this.cleanup(), this.windowMs);
  }

  /**
   * リクエストをチェック
   */
  checkRequest(ip) {
    const now = Date.now();
    const requestData = this.requests.get(ip);

    if (!requestData || now > requestData.resetTime) {
      // 新しいウィンドウ
      this.requests.set(ip, {
        count: 1,
        resetTime: now + this.windowMs
      });
      return { allowed: true, remaining: this.maxRequests - 1 };
    }

    if (requestData.count >= this.maxRequests) {
      // レート制限に達している
      return {
        allowed: false,
        remaining: 0,
        resetTime: requestData.resetTime
      };
    }

    // リクエスト数を増加
    requestData.count++;
    return {
      allowed: true,
      remaining: this.maxRequests - requestData.count
    };
  }

  /**
   * 期限切れエントリをクリーンアップ
   */
  cleanup() {
    const now = Date.now();
    for (const [ip, data] of this.requests.entries()) {
      if (now > data.resetTime) {
        this.requests.delete(ip);
      }
    }
  }
}

/**
 * 入力検証クラス
 */
export class InputValidator {
  /**
   * Vimeo URLの検証
   */
  static validateVimeoUrl(url) {
    if (!url || typeof url !== 'string') {
      throw new Error('URLが必要です');
    }

    // 基本的なURL形式チェック
    try {
      new URL(url);
    } catch {
      throw new Error('無効なURL形式です');
    }

    // Vimeo URLパターンチェック
    const vimeoPattern = /^https:\/\/(www\.)?vimeo\.com\/(\d+)(\?.*)?$/;
    if (!vimeoPattern.test(url)) {
      throw new Error('有効なVimeo URLを入力してください');
    }

    // URLの長さチェック
    if (url.length > 500) {
      throw new Error('URLが長すぎます');
    }

    return true;
  }

  /**
   * ジョブIDの検証
   */
  static validateJobId(jobId) {
    if (!jobId || typeof jobId !== 'string') {
      throw new Error('ジョブIDが必要です');
    }

    // 16進数文字列かチェック（32文字）
    const hexPattern = /^[a-f0-9]{32}$/;
    if (!hexPattern.test(jobId)) {
      throw new Error('無効なジョブIDです');
    }

    return true;
  }

  /**
   * 講義情報の検証
   */
  static validateLectureInfo(lectureInfo) {
    if (!lectureInfo || typeof lectureInfo !== 'object') {
      throw new Error('講義情報が必要です');
    }

    const { theme, speaker, description } = lectureInfo;

    // テーマの検証
    if (!theme || typeof theme !== 'string' || theme.trim().length === 0) {
      throw new Error('講義テーマが必要です');
    }
    if (theme.length > 200) {
      throw new Error('講義テーマが長すぎます（200文字以内）');
    }

    // 講演者情報の検証
    if (!speaker || typeof speaker !== 'object') {
      throw new Error('講演者情報が必要です');
    }
    if (!speaker.name || typeof speaker.name !== 'string' || speaker.name.trim().length === 0) {
      throw new Error('講演者名が必要です');
    }
    if (speaker.name.length > 100) {
      throw new Error('講演者名が長すぎます（100文字以内）');
    }

    // 説明文の検証
    if (description && typeof description === 'string' && description.length > 2000) {
      throw new Error('説明文が長すぎます（2000文字以内）');
    }

    return true;
  }

  /**
   * ファイルサイズの検証
   */
  static validateFileSize(size, maxSize = config.api.maxFileSize) {
    if (typeof size !== 'number' || size < 0) {
      throw new Error('無効なファイルサイズです');
    }

    if (size > maxSize) {
      const maxMB = Math.round(maxSize / 1024 / 1024);
      throw new Error(`ファイルサイズが制限を超えています（最大${maxMB}MB）`);
    }

    return true;
  }

  /**
   * XSS攻撃の防止
   */
  static sanitizeString(input) {
    if (typeof input !== 'string') {
      return input;
    }

    return input
      .replace(/[<>]/g, '') // HTMLタグを除去
      .replace(/javascript:/gi, '') // JavaScriptプロトコルを除去
      .replace(/on\w+=/gi, '') // イベントハンドラを除去
      .trim();
  }
}

/**
 * データ暗号化クラス
 */
export class DataEncryption {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.keyLength = 32;
    this.ivLength = 16;
    this.tagLength = 16;
  }

  /**
   * 暗号化キーを生成
   */
  generateKey() {
    return crypto.randomBytes(this.keyLength);
  }

  /**
   * データを暗号化
   */
  encrypt(data, key) {
    try {
      const iv = crypto.randomBytes(this.ivLength);
      const cipher = crypto.createCipher(this.algorithm, key, iv);
      
      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const tag = cipher.getAuthTag();
      
      return {
        encrypted,
        iv: iv.toString('hex'),
        tag: tag.toString('hex')
      };
    } catch (error) {
      throw new Error(`暗号化に失敗しました: ${error.message}`);
    }
  }

  /**
   * データを復号化
   */
  decrypt(encryptedData, key) {
    try {
      const { encrypted, iv, tag } = encryptedData;
      const decipher = crypto.createDecipher(this.algorithm, key, Buffer.from(iv, 'hex'));
      
      decipher.setAuthTag(Buffer.from(tag, 'hex'));
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      throw new Error(`復号化に失敗しました: ${error.message}`);
    }
  }

  /**
   * ハッシュ値を生成
   */
  generateHash(data, salt = null) {
    const actualSalt = salt || crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(data, actualSalt, 10000, 64, 'sha512');
    
    return {
      hash: hash.toString('hex'),
      salt: actualSalt
    };
  }

  /**
   * ハッシュ値を検証
   */
  verifyHash(data, hash, salt) {
    const computed = this.generateHash(data, salt);
    return computed.hash === hash;
  }
}

/**
 * セキュリティミドルウェア
 */
export function createSecurityMiddleware() {
  const rateLimiter = new RateLimiter();

  return function securityMiddleware(req, res, next) {
    // CORS設定
    const allowedOrigins = config.security.allowedOrigins;
    const origin = req.headers.origin;
    
    if (allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24時間

    // セキュリティヘッダー
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'");

    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    // IPアドレスを取得
    const ip = req.headers['x-forwarded-for'] || 
               req.headers['x-real-ip'] || 
               req.connection?.remoteAddress || 
               req.socket?.remoteAddress ||
               '127.0.0.1';

    // レート制限チェック
    const rateCheck = rateLimiter.checkRequest(ip);
    
    res.setHeader('X-RateLimit-Limit', config.security.maxRequestsPerMinute);
    res.setHeader('X-RateLimit-Remaining', rateCheck.remaining);
    
    if (!rateCheck.allowed) {
      res.setHeader('Retry-After', Math.ceil((rateCheck.resetTime - Date.now()) / 1000));
      res.status(429).json({
        error: 'Too Many Requests',
        message: 'レート制限に達しました。しばらく待ってから再試行してください。',
        retryAfter: Math.ceil((rateCheck.resetTime - Date.now()) / 1000)
      });
      return;
    }

    // リクエストサイズチェック
    const contentLength = parseInt(req.headers['content-length'] || '0');
    if (contentLength > config.api.maxFileSize) {
      res.status(413).json({
        error: 'Payload Too Large',
        message: 'リクエストサイズが制限を超えています'
      });
      return;
    }

    next();
  };
}

/**
 * プライバシー保護のためのデータクリーンアップ
 */
export class PrivacyProtection {
  /**
   * 個人情報をマスク
   */
  static maskPersonalInfo(data) {
    if (typeof data !== 'object' || !data) {
      return data;
    }

    const masked = { ...data };
    
    // 名前の一部をマスク
    if (masked.speaker?.name) {
      const name = masked.speaker.name;
      if (name.length > 2) {
        masked.speaker.name = name.charAt(0) + '*'.repeat(name.length - 2) + name.charAt(name.length - 1);
      }
    }

    // メールアドレスをマスク
    if (masked.email) {
      const [local, domain] = masked.email.split('@');
      if (local && domain) {
        masked.email = local.charAt(0) + '*'.repeat(Math.max(0, local.length - 2)) + 
                     local.charAt(local.length - 1) + '@' + domain;
      }
    }

    return masked;
  }

  /**
   * 一時データの自動削除スケジュール
   */
  static scheduleDataCleanup(jobId, ttl = config.security.sessionTimeout) {
    setTimeout(async () => {
      try {
        // Redis からジョブデータを削除
        const { deleteJobState } = await import('./storage.js');
        await deleteJobState(jobId);
        
        console.log(`Auto-deleted job data for privacy: ${jobId}`);
      } catch (error) {
        console.error(`Failed to auto-delete job data: ${jobId}`, error);
      }
    }, ttl);
  }

  /**
   * ログから機密情報を除去
   */
  static sanitizeLogs(logData) {
    if (typeof logData !== 'string') {
      return logData;
    }

    return logData
      .replace(/Bearer\s+[A-Za-z0-9\-_]+/g, 'Bearer ***')
      .replace(/token["\s]*[:=]["\s]*[A-Za-z0-9\-_]+/gi, 'token: ***')
      .replace(/password["\s]*[:=]["\s]*[^"\s]+/gi, 'password: ***')
      .replace(/key["\s]*[:=]["\s]*[A-Za-z0-9\-_]+/gi, 'key: ***');
  }
}

/**
 * セキュアなジョブID生成
 */
export function generateSecureJobId() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * リクエストの検証
 */
export function validateRequest(req, requiredFields = []) {
  // Content-Type チェック
  if (req.method === 'POST' && !req.headers['content-type']?.includes('application/json')) {
    throw new Error('Content-Type must be application/json');
  }

  // 必須フィールドチェック
  for (const field of requiredFields) {
    if (!req.body || req.body[field] === undefined || req.body[field] === null) {
      throw new Error(`Required field missing: ${field}`);
    }
  }

  // ボディサイズチェック
  const bodyStr = JSON.stringify(req.body || {});
  if (bodyStr.length > 1024 * 1024) { // 1MB
    throw new Error('Request body too large');
  }

  return true;
}

export default {
  RateLimiter,
  InputValidator,
  DataEncryption,
  PrivacyProtection,
  createSecurityMiddleware,
  generateSecureJobId,
  validateRequest
};
