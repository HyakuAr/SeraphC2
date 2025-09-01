/**
 * Redis caching service for SeraphC2
 * Provides high-performance caching and session management
 */

import Redis, { RedisOptions } from 'ioredis';
import { EventEmitter } from 'events';

export interface CacheConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  retryDelayOnFailover?: number;
  maxRetriesPerRequest?: number;
  lazyConnect?: boolean;
  enableReadyCheck?: boolean;
  maxLoadingTimeout?: number;
  connectTimeout?: number;
  commandTimeout?: number;
  family?: 4 | 6;
  keepAlive?: number;
  noDelay?: boolean;
}

export interface CacheItem<T = any> {
  value: T;
  ttl?: number;
  createdAt: Date;
  accessCount: number;
  lastAccessed: Date;
}

export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  errors: number;
  totalKeys: number;
  memoryUsage: number;
  uptime: number;
}

export class RedisService extends EventEmitter {
  private static instance: RedisService;
  private redis!: Redis;
  private isConnected: boolean = false;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    errors: 0,
    totalKeys: 0,
    memoryUsage: 0,
    uptime: 0,
  };
  private startTime: Date = new Date();

  private constructor(private config: CacheConfig) {
    super();
    this.initializeRedis();
  }

  public static getInstance(config?: CacheConfig): RedisService {
    if (!RedisService.instance) {
      if (!config) {
        throw new Error('Redis configuration required for first initialization');
      }
      RedisService.instance = new RedisService(config);
    }
    return RedisService.instance;
  }

  private initializeRedis(): void {
    const redisOptions: RedisOptions = {
      host: this.config.host,
      port: this.config.port,
      ...(this.config.password && { password: this.config.password }),
      db: this.config.db || 0,
      keyPrefix: this.config.keyPrefix || 'seraphc2:',
      maxRetriesPerRequest: this.config.maxRetriesPerRequest || 3,
      lazyConnect: this.config.lazyConnect !== false,
      enableReadyCheck: this.config.enableReadyCheck !== false,
      connectTimeout: this.config.connectTimeout || 10000,
      commandTimeout: this.config.commandTimeout || 5000,
      family: this.config.family || 4,
      keepAlive: this.config.keepAlive || 30000,
    };

    this.redis = new Redis(redisOptions);

    // Event handlers
    this.redis.on('connect', () => {
      console.log('✅ Redis connected successfully');
      this.isConnected = true;
      this.emit('connected');
    });

    this.redis.on('ready', () => {
      console.log('✅ Redis ready for operations');
      this.emit('ready');
    });

    this.redis.on('error', (error: Error) => {
      console.error('❌ Redis error:', error);
      this.stats.errors++;
      this.isConnected = false;
      this.emit('error', error);
    });

    this.redis.on('close', () => {
      console.log('🔌 Redis connection closed');
      this.isConnected = false;
      this.emit('disconnected');
    });

    this.redis.on('reconnecting', () => {
      console.log('🔄 Redis reconnecting...');
      this.emit('reconnecting');
    });
  }

  public async connect(): Promise<void> {
    try {
      await this.redis.connect();
      this.isConnected = true;
    } catch (error) {
      console.error('❌ Failed to connect to Redis:', error);
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    try {
      await this.redis.disconnect();
      this.isConnected = false;
    } catch (error) {
      console.error('❌ Error disconnecting from Redis:', error);
      throw error;
    }
  }

  public isHealthy(): boolean {
    return this.isConnected && this.redis.status === 'ready';
  }

  // Basic cache operations
  public async get<T = any>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get(key);
      if (value === null) {
        this.stats.misses++;
        return null;
      }
      this.stats.hits++;
      return JSON.parse(value);
    } catch (error) {
      this.stats.errors++;
      console.error('Redis GET error:', error);
      throw error;
    }
  }

  public async set<T = any>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      if (ttlSeconds) {
        await this.redis.setex(key, ttlSeconds, serialized);
      } else {
        await this.redis.set(key, serialized);
      }
      this.stats.sets++;
    } catch (error) {
      this.stats.errors++;
      console.error('Redis SET error:', error);
      throw error;
    }
  }

  public async del(key: string | string[]): Promise<number> {
    try {
      const result = Array.isArray(key) ? await this.redis.del(...key) : await this.redis.del(key);
      this.stats.deletes++;
      return result;
    } catch (error) {
      this.stats.errors++;
      console.error('Redis DEL error:', error);
      throw error;
    }
  }

  public async exists(key: string): Promise<boolean> {
    try {
      const result = await this.redis.exists(key);
      return result === 1;
    } catch (error) {
      this.stats.errors++;
      console.error('Redis EXISTS error:', error);
      throw error;
    }
  }

  public async expire(key: string, seconds: number): Promise<boolean> {
    try {
      const result = await this.redis.expire(key, seconds);
      return result === 1;
    } catch (error) {
      this.stats.errors++;
      console.error('Redis EXPIRE error:', error);
      throw error;
    }
  }

  public async ttl(key: string): Promise<number> {
    try {
      return await this.redis.ttl(key);
    } catch (error) {
      this.stats.errors++;
      console.error('Redis TTL error:', error);
      throw error;
    }
  }

  // Hash operations for complex data structures
  public async hget(key: string, field: string): Promise<string | null> {
    try {
      return await this.redis.hget(key, field);
    } catch (error) {
      this.stats.errors++;
      console.error('Redis HGET error:', error);
      throw error;
    }
  }

  public async hset(key: string, field: string, value: string): Promise<number> {
    try {
      return await this.redis.hset(key, field, value);
    } catch (error) {
      this.stats.errors++;
      console.error('Redis HSET error:', error);
      throw error;
    }
  }

  public async hgetall(key: string): Promise<Record<string, string>> {
    try {
      return await this.redis.hgetall(key);
    } catch (error) {
      this.stats.errors++;
      console.error('Redis HGETALL error:', error);
      throw error;
    }
  }

  public async hdel(key: string, field: string | string[]): Promise<number> {
    try {
      return Array.isArray(field)
        ? await this.redis.hdel(key, ...field)
        : await this.redis.hdel(key, field);
    } catch (error) {
      this.stats.errors++;
      console.error('Redis HDEL error:', error);
      throw error;
    }
  }

  // List operations for queues and logs
  public async lpush(key: string, ...values: string[]): Promise<number> {
    try {
      return await this.redis.lpush(key, ...values);
    } catch (error) {
      this.stats.errors++;
      console.error('Redis LPUSH error:', error);
      throw error;
    }
  }

  public async rpop(key: string): Promise<string | null> {
    try {
      return await this.redis.rpop(key);
    } catch (error) {
      this.stats.errors++;
      console.error('Redis RPOP error:', error);
      throw error;
    }
  }

  public async llen(key: string): Promise<number> {
    try {
      return await this.redis.llen(key);
    } catch (error) {
      this.stats.errors++;
      console.error('Redis LLEN error:', error);
      throw error;
    }
  }

  public async lrange(key: string, start: number, stop: number): Promise<string[]> {
    try {
      return await this.redis.lrange(key, start, stop);
    } catch (error) {
      this.stats.errors++;
      console.error('Redis LRANGE error:', error);
      throw error;
    }
  }

  // Set operations for unique collections
  public async sadd(key: string, ...members: string[]): Promise<number> {
    try {
      return await this.redis.sadd(key, ...members);
    } catch (error) {
      this.stats.errors++;
      console.error('Redis SADD error:', error);
      throw error;
    }
  }

  public async srem(key: string, ...members: string[]): Promise<number> {
    try {
      return await this.redis.srem(key, ...members);
    } catch (error) {
      this.stats.errors++;
      console.error('Redis SREM error:', error);
      throw error;
    }
  }

  public async smembers(key: string): Promise<string[]> {
    try {
      return await this.redis.smembers(key);
    } catch (error) {
      this.stats.errors++;
      console.error('Redis SMEMBERS error:', error);
      throw error;
    }
  }

  public async sismember(key: string, member: string): Promise<boolean> {
    try {
      const result = await this.redis.sismember(key, member);
      return result === 1;
    } catch (error) {
      this.stats.errors++;
      console.error('Redis SISMEMBER error:', error);
      throw error;
    }
  }

  // Sorted set operations for rankings and time-based data
  public async zadd(key: string, score: number, member: string): Promise<number> {
    try {
      return await this.redis.zadd(key, score, member);
    } catch (error) {
      this.stats.errors++;
      console.error('Redis ZADD error:', error);
      throw error;
    }
  }

  public async zrange(
    key: string,
    start: number,
    stop: number,
    withScores?: boolean
  ): Promise<string[]> {
    try {
      if (withScores) {
        return await this.redis.zrange(key, start, stop, 'WITHSCORES');
      }
      return await this.redis.zrange(key, start, stop);
    } catch (error) {
      this.stats.errors++;
      console.error('Redis ZRANGE error:', error);
      throw error;
    }
  }

  public async zrem(key: string, ...members: string[]): Promise<number> {
    try {
      return await this.redis.zrem(key, ...members);
    } catch (error) {
      this.stats.errors++;
      console.error('Redis ZREM error:', error);
      throw error;
    }
  }

  // Pub/Sub operations for real-time messaging
  public async publish(channel: string, message: string): Promise<number> {
    try {
      return await this.redis.publish(channel, message);
    } catch (error) {
      this.stats.errors++;
      console.error('Redis PUBLISH error:', error);
      throw error;
    }
  }

  public async subscribe(channel: string, callback: (message: string) => void): Promise<void> {
    try {
      const subscriber = this.redis.duplicate();
      await subscriber.subscribe(channel);
      subscriber.on('message', (receivedChannel: string, message: string) => {
        if (receivedChannel === channel) {
          callback(message);
        }
      });
    } catch (error) {
      this.stats.errors++;
      console.error('Redis SUBSCRIBE error:', error);
      throw error;
    }
  }

  // Advanced operations
  public async pipeline(): Promise<any> {
    return this.redis.pipeline();
  }

  public async multi(): Promise<any> {
    return this.redis.multi();
  }

  public async flushdb(): Promise<string> {
    try {
      return await this.redis.flushdb();
    } catch (error) {
      this.stats.errors++;
      console.error('Redis FLUSHDB error:', error);
      throw error;
    }
  }

  public async keys(pattern: string): Promise<string[]> {
    try {
      return await this.redis.keys(pattern);
    } catch (error) {
      this.stats.errors++;
      console.error('Redis KEYS error:', error);
      throw error;
    }
  }

  // Statistics and monitoring
  public async getStats(): Promise<CacheStats> {
    try {
      const info = await this.redis.info('memory');
      const memoryMatch = info.match(/used_memory:(\d+)/);
      const memoryUsage = memoryMatch ? parseInt(memoryMatch[1]!) : 0;

      const keyCount = await this.redis.dbsize();

      return {
        ...this.stats,
        totalKeys: keyCount,
        memoryUsage,
        uptime: Date.now() - this.startTime.getTime(),
      };
    } catch (error) {
      this.stats.errors++;
      console.error('Redis STATS error:', error);
      throw error;
    }
  }

  public resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0,
      totalKeys: 0,
      memoryUsage: 0,
      uptime: 0,
    };
    this.startTime = new Date();
  }

  // Health check
  public async ping(): Promise<string> {
    try {
      return await this.redis.ping();
    } catch (error) {
      this.stats.errors++;
      console.error('Redis PING error:', error);
      throw error;
    }
  }

  // Get Redis client for advanced operations
  public getClient(): Redis {
    return this.redis;
  }
}
