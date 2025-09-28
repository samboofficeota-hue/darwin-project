/**
 * 永続化ストレージ管理
 * Upstash Redis を使用した状態管理
 */

import { Redis } from '@upstash/redis';

// Redis接続設定
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

/**
 * ジョブ状態を保存
 */
export async function saveJobState(jobId, state) {
  try {
    const key = `job:${jobId}`;
    const data = {
      ...state,
      lastUpdate: new Date().toISOString(),
    };
    
    await redis.set(key, JSON.stringify(data), { ex: 3600 }); // 1時間で期限切れ
    console.log('Job state saved to Redis:', jobId, state.status);
    return true;
  } catch (error) {
    console.error('Error saving job state to Redis:', error);
    return false;
  }
}

/**
 * ジョブ状態を読み込み
 */
export async function loadJobState(jobId) {
  try {
    const key = `job:${jobId}`;
    const data = await redis.get(key);
    
    if (!data) {
      console.log('Job state not found in Redis:', jobId);
      return null;
    }
    
    const job = typeof data === 'string' ? JSON.parse(data) : data;
    console.log('Job state loaded from Redis:', jobId, job.status);
    return job;
  } catch (error) {
    console.error('Error loading job state from Redis:', error);
    return null;
  }
}

/**
 * ジョブ状態を削除
 */
export async function deleteJobState(jobId) {
  try {
    const key = `job:${jobId}`;
    await redis.del(key);
    console.log('Job state deleted from Redis:', jobId);
    return true;
  } catch (error) {
    console.error('Error deleting job state from Redis:', error);
    return false;
  }
}

/**
 * ジョブ状態を更新
 */
export async function updateJobState(jobId, updates) {
  try {
    const currentState = await loadJobState(jobId);
    if (!currentState) {
      console.log('Cannot update non-existent job:', jobId);
      return false;
    }
    
    const updatedState = {
      ...currentState,
      ...updates,
      lastUpdate: new Date().toISOString(),
    };
    
    return await saveJobState(jobId, updatedState);
  } catch (error) {
    console.error('Error updating job state:', error);
    return false;
  }
}

/**
 * 全てのジョブ一覧を取得
 */
export async function getAllJobs() {
  try {
    const keys = await redis.keys('job:*');
    const jobs = [];
    
    for (const key of keys) {
      const data = await redis.get(key);
      if (data) {
        const job = typeof data === 'string' ? JSON.parse(data) : data;
        jobs.push({
          jobId: key.replace('job:', ''),
          ...job
        });
      }
    }
    
    return jobs;
  } catch (error) {
    console.error('Error getting all jobs:', error);
    return [];
  }
}

/**
 * 期限切れのジョブをクリーンアップ
 */
export async function cleanupExpiredJobs() {
  try {
    const jobs = await getAllJobs();
    const now = new Date();
    const expiredJobs = jobs.filter(job => {
      const lastUpdate = new Date(job.lastUpdate);
      const hoursSinceUpdate = (now - lastUpdate) / (1000 * 60 * 60);
      return hoursSinceUpdate > 24; // 24時間以上古いジョブ
    });
    
    for (const job of expiredJobs) {
      await deleteJobState(job.jobId);
      console.log('Cleaned up expired job:', job.jobId);
    }
    
    return expiredJobs.length;
  } catch (error) {
    console.error('Error cleaning up expired jobs:', error);
    return 0;
  }
}
