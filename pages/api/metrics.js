/**
 * システムメトリクスとパフォーマンス情報API
 * 監視とデバッグ用のエンドポイント
 */

import { 
  performanceMonitor, 
  apiResponseMonitor, 
  systemHealthMonitor,
  PerformanceOptimizer 
} from '../../lib/monitoring.js';
import { getConfigForLogging } from '../../lib/config.js';

export default async function handler(req, res) {
  // セキュリティヘッダー設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { type, format } = req.query;

    let responseData = {};

    switch (type) {
      case 'performance':
        responseData = await getPerformanceMetrics();
        break;
      case 'health':
        responseData = await getHealthMetrics();
        break;
      case 'api':
        responseData = await getAPIMetrics();
        break;
      case 'system':
        responseData = await getSystemMetrics();
        break;
      case 'all':
      default:
        responseData = await getAllMetrics();
        break;
    }

    // フォーマット指定
    if (format === 'prometheus') {
      res.setHeader('Content-Type', 'text/plain');
      res.status(200).send(formatPrometheus(responseData));
    } else {
      res.status(200).json(responseData);
    }

  } catch (error) {
    console.error('Metrics API error:', error);
    res.status(500).json({
      error: 'メトリクス取得エラーが発生しました',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * パフォーマンスメトリクスを取得
 */
async function getPerformanceMetrics() {
  const metrics = performanceMonitor.getMetrics();
  const warnings = performanceMonitor.checkPerformanceWarnings();
  const suggestions = PerformanceOptimizer.generateOptimizationSuggestions(metrics);

  return {
    performance: metrics,
    warnings,
    suggestions,
    timestamp: new Date().toISOString()
  };
}

/**
 * ヘルスメトリクスを取得
 */
async function getHealthMetrics() {
  const health = await systemHealthMonitor.performHealthCheck();
  const memoryUsage = performanceMonitor.getCurrentMemoryUsage();

  return {
    health,
    memory: memoryUsage,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  };
}

/**
 * APIメトリクスを取得
 */
async function getAPIMetrics() {
  const stats1h = apiResponseMonitor.getStatistics(3600000); // 1時間
  const stats24h = apiResponseMonitor.getStatistics(86400000); // 24時間

  return {
    responseTime: {
      last1h: stats1h,
      last24h: stats24h
    },
    timestamp: new Date().toISOString()
  };
}

/**
 * システムメトリクスを取得
 */
async function getSystemMetrics() {
  const config = getConfigForLogging();
  const nodeVersion = process.version;
  const platform = process.platform;
  const arch = process.arch;

  return {
    system: {
      nodeVersion,
      platform,
      arch,
      uptime: process.uptime(),
      pid: process.pid
    },
    configuration: config,
    timestamp: new Date().toISOString()
  };
}

/**
 * すべてのメトリクスを取得
 */
async function getAllMetrics() {
  const [performance, health, api, system] = await Promise.all([
    getPerformanceMetrics(),
    getHealthMetrics(),
    getAPIMetrics(),
    getSystemMetrics()
  ]);

  return {
    performance: performance.performance,
    warnings: performance.warnings,
    suggestions: performance.suggestions,
    health: health.health,
    memory: health.memory,
    api: api.responseTime,
    system: system.system,
    configuration: system.configuration,
    timestamp: new Date().toISOString()
  };
}

/**
 * Prometheus形式でメトリクスをフォーマット
 */
function formatPrometheus(data) {
  let output = '';

  // システムメトリクス
  if (data.performance?.system) {
    const sys = data.performance.system;
    output += `# HELP darwin_requests_total Total number of requests\n`;
    output += `# TYPE darwin_requests_total counter\n`;
    output += `darwin_requests_total ${sys.requests}\n\n`;

    output += `# HELP darwin_errors_total Total number of errors\n`;
    output += `# TYPE darwin_errors_total counter\n`;
    output += `darwin_errors_total ${sys.errors}\n\n`;

    output += `# HELP darwin_active_jobs Current number of active jobs\n`;
    output += `# TYPE darwin_active_jobs gauge\n`;
    output += `darwin_active_jobs ${sys.activeJobs}\n\n`;

    output += `# HELP darwin_completed_jobs_total Total number of completed jobs\n`;
    output += `# TYPE darwin_completed_jobs_total counter\n`;
    output += `darwin_completed_jobs_total ${sys.completedJobs}\n\n`;

    output += `# HELP darwin_failed_jobs_total Total number of failed jobs\n`;
    output += `# TYPE darwin_failed_jobs_total counter\n`;
    output += `darwin_failed_jobs_total ${sys.failedJobs}\n\n`;
  }

  // メモリメトリクス
  if (data.memory) {
    const memory = process.memoryUsage();
    output += `# HELP darwin_memory_usage_bytes Memory usage in bytes\n`;
    output += `# TYPE darwin_memory_usage_bytes gauge\n`;
    output += `darwin_memory_usage_bytes{type="rss"} ${memory.rss}\n`;
    output += `darwin_memory_usage_bytes{type="heap_total"} ${memory.heapTotal}\n`;
    output += `darwin_memory_usage_bytes{type="heap_used"} ${memory.heapUsed}\n`;
    output += `darwin_memory_usage_bytes{type="external"} ${memory.external}\n\n`;
  }

  // アップタイム
  output += `# HELP darwin_uptime_seconds Process uptime in seconds\n`;
  output += `# TYPE darwin_uptime_seconds gauge\n`;
  output += `darwin_uptime_seconds ${process.uptime()}\n\n`;

  // ヘルス状態
  if (data.health) {
    const healthValue = data.health.status === 'healthy' ? 1 : 0;
    output += `# HELP darwin_health_status Health status (1=healthy, 0=unhealthy)\n`;
    output += `# TYPE darwin_health_status gauge\n`;
    output += `darwin_health_status ${healthValue}\n\n`;
  }

  return output;
}
