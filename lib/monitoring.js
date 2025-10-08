/**
 * パフォーマンス監視とメトリクス収集
 * システムの健全性とパフォーマンスを追跡
 */

import { getConfig } from './config.js';

const config = getConfig();

/**
 * パフォーマンスメトリクス収集クラス
 */
export class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
    this.startTimes = new Map();
    this.systemMetrics = {
      requests: 0,
      errors: 0,
      totalProcessingTime: 0,
      activeJobs: 0,
      completedJobs: 0,
      failedJobs: 0
    };
    
    // 定期的にメトリクスをログ出力
    setInterval(() => this.logMetrics(), 60000); // 1分間隔
  }

  /**
   * 処理時間の測定開始
   */
  startTimer(operationId) {
    this.startTimes.set(operationId, {
      start: Date.now(),
      memoryStart: process.memoryUsage()
    });
  }

  /**
   * 処理時間の測定終了
   */
  endTimer(operationId, metadata = {}) {
    const startData = this.startTimes.get(operationId);
    if (!startData) {
      console.warn(`Timer not found for operation: ${operationId}`);
      return null;
    }

    const endTime = Date.now();
    const memoryEnd = process.memoryUsage();
    const duration = endTime - startData.start;
    
    const metric = {
      operationId,
      duration,
      startTime: startData.start,
      endTime,
      memoryUsage: {
        start: startData.memoryStart,
        end: memoryEnd,
        delta: {
          rss: memoryEnd.rss - startData.memoryStart.rss,
          heapTotal: memoryEnd.heapTotal - startData.memoryStart.heapTotal,
          heapUsed: memoryEnd.heapUsed - startData.memoryStart.heapUsed,
          external: memoryEnd.external - startData.memoryStart.external
        }
      },
      metadata
    };

    this.metrics.set(operationId, metric);
    this.startTimes.delete(operationId);
    
    // システムメトリクスを更新
    this.systemMetrics.totalProcessingTime += duration;
    
    console.log(`Performance: ${operationId} completed in ${duration}ms`);
    return metric;
  }

  /**
   * リクエスト数を記録
   */
  recordRequest(success = true) {
    this.systemMetrics.requests++;
    if (!success) {
      this.systemMetrics.errors++;
    }
  }

  /**
   * ジョブ状態を記録
   */
  recordJob(status) {
    switch (status) {
      case 'started':
        this.systemMetrics.activeJobs++;
        break;
      case 'completed':
        this.systemMetrics.activeJobs--;
        this.systemMetrics.completedJobs++;
        break;
      case 'failed':
        this.systemMetrics.activeJobs--;
        this.systemMetrics.failedJobs++;
        break;
    }
  }

  /**
   * メトリクスの取得
   */
  getMetrics() {
    return {
      system: { ...this.systemMetrics },
      operations: Array.from(this.metrics.values()),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * メトリクスをログ出力
   */
  logMetrics() {
    const metrics = this.getMetrics();
    console.log('=== Performance Metrics ===');
    console.log('System:', metrics.system);
    console.log('Active operations:', this.startTimes.size);
    console.log('Memory usage:', this.getCurrentMemoryUsage());
    console.log('===========================');
  }

  /**
   * 現在のメモリ使用量を取得
   */
  getCurrentMemoryUsage() {
    const usage = process.memoryUsage();
    return {
      rss: Math.round(usage.rss / 1024 / 1024) + 'MB',
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024) + 'MB',
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + 'MB',
      external: Math.round(usage.external / 1024 / 1024) + 'MB'
    };
  }

  /**
   * パフォーマンス警告をチェック
   */
  checkPerformanceWarnings() {
    const warnings = [];
    const memory = process.memoryUsage();
    
    // メモリ使用量チェック
    if (memory.rss > 1024 * 1024 * 1024) { // 1GB
      warnings.push({
        type: 'high_memory',
        message: `High memory usage: ${Math.round(memory.rss / 1024 / 1024)}MB`,
        severity: 'warning'
      });
    }

    // エラー率チェック
    const errorRate = this.systemMetrics.requests > 0 ? 
      (this.systemMetrics.errors / this.systemMetrics.requests) * 100 : 0;
    
    if (errorRate > 10) { // 10%以上
      warnings.push({
        type: 'high_error_rate',
        message: `High error rate: ${errorRate.toFixed(2)}%`,
        severity: 'error'
      });
    }

    // アクティブジョブ数チェック
    if (this.systemMetrics.activeJobs > 10) {
      warnings.push({
        type: 'high_active_jobs',
        message: `High number of active jobs: ${this.systemMetrics.activeJobs}`,
        severity: 'warning'
      });
    }

    return warnings;
  }
}

/**
 * APIレスポンス時間監視クラス
 */
export class APIResponseMonitor {
  constructor() {
    this.responseTimes = [];
    this.maxSamples = 1000; // 最大1000サンプル保持
  }

  /**
   * レスポンス時間を記録
   */
  recordResponseTime(endpoint, method, duration, statusCode) {
    const record = {
      endpoint,
      method,
      duration,
      statusCode,
      timestamp: Date.now()
    };

    this.responseTimes.push(record);
    
    // 古いサンプルを削除
    if (this.responseTimes.length > this.maxSamples) {
      this.responseTimes.shift();
    }

    // 遅いレスポンスを警告
    if (duration > 30000) { // 30秒以上
      console.warn(`Slow API response: ${method} ${endpoint} took ${duration}ms`);
    }
  }

  /**
   * 統計情報を取得
   */
  getStatistics(timeWindow = 3600000) { // デフォルト1時間
    const now = Date.now();
    const recentResponses = this.responseTimes.filter(
      r => now - r.timestamp < timeWindow
    );

    if (recentResponses.length === 0) {
      return null;
    }

    const durations = recentResponses.map(r => r.duration);
    durations.sort((a, b) => a - b);

    const sum = durations.reduce((a, b) => a + b, 0);
    const avg = sum / durations.length;
    const median = durations[Math.floor(durations.length / 2)];
    const p95 = durations[Math.floor(durations.length * 0.95)];
    const p99 = durations[Math.floor(durations.length * 0.99)];

    return {
      count: recentResponses.length,
      average: Math.round(avg),
      median: Math.round(median),
      p95: Math.round(p95),
      p99: Math.round(p99),
      min: durations[0],
      max: durations[durations.length - 1],
      timeWindow: timeWindow / 1000 / 60 // 分単位
    };
  }
}

/**
 * システムヘルス監視クラス
 */
export class SystemHealthMonitor {
  constructor() {
    this.healthChecks = new Map();
    this.alertThresholds = {
      memoryUsage: 0.8, // 80%
      cpuUsage: 0.8,    // 80%
      diskUsage: 0.9,   // 90%
      responseTime: 5000 // 5秒
    };
  }

  /**
   * ヘルスチェックを実行
   */
  async performHealthCheck() {
    const checks = {
      memory: this.checkMemoryHealth(),
      disk: await this.checkDiskHealth(),
      network: await this.checkNetworkHealth(),
      dependencies: await this.checkDependenciesHealth()
    };

    const overallHealth = Object.values(checks).every(check => check.status === 'healthy');
    
    return {
      status: overallHealth ? 'healthy' : 'unhealthy',
      checks,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * メモリヘルスチェック
   */
  checkMemoryHealth() {
    const usage = process.memoryUsage();
    const totalMemory = usage.rss + usage.external;
    const threshold = 1024 * 1024 * 1024; // 1GB

    return {
      status: totalMemory < threshold ? 'healthy' : 'unhealthy',
      usage: Math.round(totalMemory / 1024 / 1024) + 'MB',
      threshold: Math.round(threshold / 1024 / 1024) + 'MB',
      details: {
        rss: Math.round(usage.rss / 1024 / 1024) + 'MB',
        heapTotal: Math.round(usage.heapTotal / 1024 / 1024) + 'MB',
        heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + 'MB',
        external: Math.round(usage.external / 1024 / 1024) + 'MB'
      }
    };
  }

  /**
   * ディスクヘルスチェック
   */
  async checkDiskHealth() {
    try {
      const fs = await import('fs');
      const stats = fs.statSync('/tmp');
      
      return {
        status: 'healthy',
        message: 'Disk access OK',
        tempDir: '/tmp'
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: 'Disk access failed',
        error: error.message
      };
    }
  }

  /**
   * ネットワークヘルスチェック
   */
  async checkNetworkHealth() {
    try {
      const startTime = Date.now();
      const response = await fetch('https://api.vimeo.com/me', {
        method: 'HEAD',
        timeout: 5000
      });
      const responseTime = Date.now() - startTime;

      return {
        status: response.ok ? 'healthy' : 'degraded',
        responseTime: responseTime + 'ms',
        statusCode: response.status
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: 'Network connectivity failed',
        error: error.message
      };
    }
  }

  /**
   * 依存関係ヘルスチェック
   */
  async checkDependenciesHealth() {
    const checks = {};

    // Redis接続チェック
    try {
      if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
        const { Redis } = await import('@upstash/redis');
        const redis = new Redis({
          url: process.env.KV_REST_API_URL,
          token: process.env.KV_REST_API_TOKEN,
        });
        
        await redis.ping();
        checks.redis = { status: 'healthy', message: 'Connected' };
      } else {
        checks.redis = { status: 'warning', message: 'Not configured' };
      }
    } catch (error) {
      checks.redis = { status: 'unhealthy', error: error.message };
    }

    // Google Cloud Speech API チェック
    try {
      const { SpeechClient } = await import('@google-cloud/speech');
      const client = new SpeechClient({
        projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
        keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      });
      
      checks.speechAPI = { status: 'healthy', message: 'Client initialized' };
    } catch (error) {
      checks.speechAPI = { status: 'unhealthy', error: error.message };
    }

    const overallStatus = Object.values(checks).every(check => 
      check.status === 'healthy' || check.status === 'warning'
    ) ? 'healthy' : 'unhealthy';

    return {
      status: overallStatus,
      services: checks
    };
  }
}

/**
 * パフォーマンス最適化の提案
 */
export class PerformanceOptimizer {
  /**
   * 最適化提案を生成
   */
  static generateOptimizationSuggestions(metrics) {
    const suggestions = [];

    // メモリ使用量の最適化
    if (metrics.system.errors > metrics.system.requests * 0.05) {
      suggestions.push({
        type: 'error_rate',
        priority: 'high',
        suggestion: 'エラー率が高いです。エラーハンドリングとリトライ機能を確認してください。'
      });
    }

    // アクティブジョブ数の最適化
    if (metrics.system.activeJobs > 5) {
      suggestions.push({
        type: 'concurrency',
        priority: 'medium',
        suggestion: 'アクティブジョブが多すぎます。並行処理数を制限することを検討してください。'
      });
    }

    // 平均処理時間の最適化
    const avgProcessingTime = metrics.system.completedJobs > 0 ? 
      metrics.system.totalProcessingTime / metrics.system.completedJobs : 0;
    
    if (avgProcessingTime > 300000) { // 5分以上
      suggestions.push({
        type: 'processing_time',
        priority: 'medium',
        suggestion: '平均処理時間が長いです。チャンクサイズの調整や並列処理の最適化を検討してください。'
      });
    }

    return suggestions;
  }
}

// グローバルインスタンス
export const performanceMonitor = new PerformanceMonitor();
export const apiResponseMonitor = new APIResponseMonitor();
export const systemHealthMonitor = new SystemHealthMonitor();

/**
 * Express/Next.js用のパフォーマンス監視ミドルウェア
 */
export function createPerformanceMiddleware() {
  return function performanceMiddleware(req, res, next) {
    const startTime = Date.now();
    const operationId = `${req.method}_${req.url}_${startTime}`;
    
    performanceMonitor.startTimer(operationId);
    performanceMonitor.recordRequest();

    // レスポンス完了時の処理
    const originalSend = res.send;
    res.send = function(data) {
      const duration = Date.now() - startTime;
      
      performanceMonitor.endTimer(operationId, {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        userAgent: req.headers['user-agent']
      });
      
      apiResponseMonitor.recordResponseTime(
        req.url,
        req.method,
        duration,
        res.statusCode
      );

      if (res.statusCode >= 400) {
        performanceMonitor.recordRequest(false);
      }

      return originalSend.call(this, data);
    };

    next();
  };
}

export default {
  PerformanceMonitor,
  APIResponseMonitor,
  SystemHealthMonitor,
  PerformanceOptimizer,
  performanceMonitor,
  apiResponseMonitor,
  systemHealthMonitor,
  createPerformanceMiddleware
};
