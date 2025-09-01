/**
 * Unit tests for RedisService
 */

import { RedisService, CacheConfig } from '../../../../src/core/cache/redis.service';
import Redis from 'ioredis';

// Mock ioredis
jest.mock('ioredis');
const MockedRedis = Redis as jest.MockedClass<typeof Redis>;

describe('RedisService', () => {
  let redisService: RedisService;
  let mockRedis: jest.Mocked<Redis>;
  let config: CacheConfig;

  beforeEach(() => {
    // Reset singleton instance
    (RedisService as any).instance = undefined;

    config = {
      host: 'localhost',
      port: 6379,
      password: 'test-password',
      db: 0,
      keyPrefix: 'test:',
    };

    mockRedis = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      get: jest.fn(),
      set: jest.fn(),
      setex: jest.fn(),
      del: jest.fn(),
      exists: jest.fn(),
      expire: jest.fn(),
      ttl: jest.fn(),
      hget: jest.fn(),
      hset: jest.fn(),
      hgetall: jest.fn(),
      hdel: jest.fn(),
      lpush: jest.fn(),
      rpop: jest.fn(),
      llen: jest.fn(),
      lrange: jest.fn(),
      sadd: jest.fn(),
      srem: jest.fn(),
      smembers: jest.fn(),
      sismember: jest.fn(),
      zadd: jest.fn(),
      zrange: jest.fn(),
      zrem: jest.fn(),
      publish: jest.fn(),
      duplicate: jest.fn(),
      pipeline: jest.fn(),
      multi: jest.fn(),
      flushdb: jest.fn(),
      keys: jest.fn(),
      info: jest.fn(),
      dbsize: jest.fn(),
      ping: jest.fn(),
      on: jest.fn(),
      status: 'ready',
    } as any;

    MockedRedis.mockImplementation(() => mockRedis);
    redisService = RedisService.getInstance(config);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getInstance', () => {
    it('should create singleton instance with config', () => {
      const instance1 = RedisService.getInstance(config);
      const instance2 = RedisService.getInstance();

      expect(instance1).toBe(instance2);
      expect(MockedRedis).toHaveBeenCalledWith({
        host: 'localhost',
        port: 6379,
        password: 'test-password',
        db: 0,
        keyPrefix: 'test:',
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        enableReadyCheck: true,
        connectTimeout: 10000,
        commandTimeout: 5000,
        family: 4,
        keepAlive: 30000,
      });
    });

    it('should throw error if no config provided for first initialization', () => {
      (RedisService as any).instance = undefined;

      expect(() => RedisService.getInstance()).toThrow(
        'Redis configuration required for first initialization'
      );
    });
  });

  describe('connection management', () => {
    it('should connect successfully', async () => {
      mockRedis.connect.mockResolvedValue(undefined);

      await redisService.connect();

      expect(mockRedis.connect).toHaveBeenCalled();
    });

    it('should handle connection errors', async () => {
      const error = new Error('Connection failed');
      mockRedis.connect.mockRejectedValue(error);

      await expect(redisService.connect()).rejects.toThrow('Connection failed');
    });

    it('should disconnect successfully', async () => {
      mockRedis.disconnect.mockResolvedValue(undefined);

      await redisService.disconnect();

      expect(mockRedis.disconnect).toHaveBeenCalled();
    });

    it('should check health status', () => {
      (redisService as any).isConnected = true;
      mockRedis.status = 'ready';

      expect(redisService.isHealthy()).toBe(true);

      (redisService as any).isConnected = false;
      expect(redisService.isHealthy()).toBe(false);

      (redisService as any).isConnected = true;
      mockRedis.status = 'connecting';
      expect(redisService.isHealthy()).toBe(false);
    });
  });

  describe('basic cache operations', () => {
    it('should get value successfully', async () => {
      const testData = { key: 'value' };
      mockRedis.get.mockResolvedValue(JSON.stringify(testData));

      const result = await redisService.get('test-key');

      expect(mockRedis.get).toHaveBeenCalledWith('test-key');
      expect(result).toEqual(testData);
    });

    it('should return null for non-existent key', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await redisService.get('non-existent');

      expect(result).toBeNull();
    });

    it('should handle get errors', async () => {
      const error = new Error('Redis error');
      mockRedis.get.mockRejectedValue(error);

      await expect(redisService.get('test-key')).rejects.toThrow('Redis error');
    });

    it('should set value without TTL', async () => {
      const testData = { key: 'value' };
      mockRedis.set.mockResolvedValue('OK');

      await redisService.set('test-key', testData);

      expect(mockRedis.set).toHaveBeenCalledWith('test-key', JSON.stringify(testData));
    });

    it('should set value with TTL', async () => {
      const testData = { key: 'value' };
      mockRedis.setex.mockResolvedValue('OK');

      await redisService.set('test-key', testData, 3600);

      expect(mockRedis.setex).toHaveBeenCalledWith('test-key', 3600, JSON.stringify(testData));
    });

    it('should delete single key', async () => {
      mockRedis.del.mockResolvedValue(1);

      const result = await redisService.del('test-key');

      expect(mockRedis.del).toHaveBeenCalledWith('test-key');
      expect(result).toBe(1);
    });

    it('should delete multiple keys', async () => {
      mockRedis.del.mockResolvedValue(2);

      const result = await redisService.del(['key1', 'key2']);

      expect(mockRedis.del).toHaveBeenCalledWith('key1', 'key2');
      expect(result).toBe(2);
    });

    it('should check if key exists', async () => {
      mockRedis.exists.mockResolvedValue(1);

      const result = await redisService.exists('test-key');

      expect(mockRedis.exists).toHaveBeenCalledWith('test-key');
      expect(result).toBe(true);
    });

    it('should set expiration', async () => {
      mockRedis.expire.mockResolvedValue(1);

      const result = await redisService.expire('test-key', 3600);

      expect(mockRedis.expire).toHaveBeenCalledWith('test-key', 3600);
      expect(result).toBe(true);
    });

    it('should get TTL', async () => {
      mockRedis.ttl.mockResolvedValue(3600);

      const result = await redisService.ttl('test-key');

      expect(mockRedis.ttl).toHaveBeenCalledWith('test-key');
      expect(result).toBe(3600);
    });
  });

  describe('hash operations', () => {
    it('should get hash field', async () => {
      mockRedis.hget.mockResolvedValue('field-value');

      const result = await redisService.hget('hash-key', 'field');

      expect(mockRedis.hget).toHaveBeenCalledWith('hash-key', 'field');
      expect(result).toBe('field-value');
    });

    it('should set hash field', async () => {
      mockRedis.hset.mockResolvedValue(1);

      const result = await redisService.hset('hash-key', 'field', 'value');

      expect(mockRedis.hset).toHaveBeenCalledWith('hash-key', 'field', 'value');
      expect(result).toBe(1);
    });

    it('should get all hash fields', async () => {
      const hashData = { field1: 'value1', field2: 'value2' };
      mockRedis.hgetall.mockResolvedValue(hashData);

      const result = await redisService.hgetall('hash-key');

      expect(mockRedis.hgetall).toHaveBeenCalledWith('hash-key');
      expect(result).toEqual(hashData);
    });

    it('should delete hash field', async () => {
      mockRedis.hdel.mockResolvedValue(1);

      const result = await redisService.hdel('hash-key', 'field');

      expect(mockRedis.hdel).toHaveBeenCalledWith('hash-key', 'field');
      expect(result).toBe(1);
    });

    it('should delete multiple hash fields', async () => {
      mockRedis.hdel.mockResolvedValue(2);

      const result = await redisService.hdel('hash-key', ['field1', 'field2']);

      expect(mockRedis.hdel).toHaveBeenCalledWith('hash-key', 'field1', 'field2');
      expect(result).toBe(2);
    });
  });

  describe('list operations', () => {
    it('should push to list', async () => {
      mockRedis.lpush.mockResolvedValue(3);

      const result = await redisService.lpush('list-key', 'value1', 'value2');

      expect(mockRedis.lpush).toHaveBeenCalledWith('list-key', 'value1', 'value2');
      expect(result).toBe(3);
    });

    it('should pop from list', async () => {
      mockRedis.rpop.mockResolvedValue('popped-value');

      const result = await redisService.rpop('list-key');

      expect(mockRedis.rpop).toHaveBeenCalledWith('list-key');
      expect(result).toBe('popped-value');
    });

    it('should get list length', async () => {
      mockRedis.llen.mockResolvedValue(5);

      const result = await redisService.llen('list-key');

      expect(mockRedis.llen).toHaveBeenCalledWith('list-key');
      expect(result).toBe(5);
    });

    it('should get list range', async () => {
      const listData = ['item1', 'item2', 'item3'];
      mockRedis.lrange.mockResolvedValue(listData);

      const result = await redisService.lrange('list-key', 0, -1);

      expect(mockRedis.lrange).toHaveBeenCalledWith('list-key', 0, -1);
      expect(result).toEqual(listData);
    });
  });

  describe('set operations', () => {
    it('should add to set', async () => {
      mockRedis.sadd.mockResolvedValue(2);

      const result = await redisService.sadd('set-key', 'member1', 'member2');

      expect(mockRedis.sadd).toHaveBeenCalledWith('set-key', 'member1', 'member2');
      expect(result).toBe(2);
    });

    it('should remove from set', async () => {
      mockRedis.srem.mockResolvedValue(1);

      const result = await redisService.srem('set-key', 'member1');

      expect(mockRedis.srem).toHaveBeenCalledWith('set-key', 'member1');
      expect(result).toBe(1);
    });

    it('should get set members', async () => {
      const setData = ['member1', 'member2', 'member3'];
      mockRedis.smembers.mockResolvedValue(setData);

      const result = await redisService.smembers('set-key');

      expect(mockRedis.smembers).toHaveBeenCalledWith('set-key');
      expect(result).toEqual(setData);
    });

    it('should check set membership', async () => {
      mockRedis.sismember.mockResolvedValue(1);

      const result = await redisService.sismember('set-key', 'member1');

      expect(mockRedis.sismember).toHaveBeenCalledWith('set-key', 'member1');
      expect(result).toBe(true);
    });
  });

  describe('sorted set operations', () => {
    it('should add to sorted set', async () => {
      mockRedis.zadd.mockResolvedValue(1);

      const result = await redisService.zadd('zset-key', 100, 'member1');

      expect(mockRedis.zadd).toHaveBeenCalledWith('zset-key', 100, 'member1');
      expect(result).toBe(1);
    });

    it('should get sorted set range', async () => {
      const zsetData = ['member1', 'member2'];
      mockRedis.zrange.mockResolvedValue(zsetData);

      const result = await redisService.zrange('zset-key', 0, -1);

      expect(mockRedis.zrange).toHaveBeenCalledWith('zset-key', 0, -1);
      expect(result).toEqual(zsetData);
    });

    it('should get sorted set range with scores', async () => {
      const zsetData = ['member1', '100', 'member2', '200'];
      mockRedis.zrange.mockResolvedValue(zsetData);

      const result = await redisService.zrange('zset-key', 0, -1, true);

      expect(mockRedis.zrange).toHaveBeenCalledWith('zset-key', 0, -1, 'WITHSCORES');
      expect(result).toEqual(zsetData);
    });

    it('should remove from sorted set', async () => {
      mockRedis.zrem.mockResolvedValue(1);

      const result = await redisService.zrem('zset-key', 'member1');

      expect(mockRedis.zrem).toHaveBeenCalledWith('zset-key', 'member1');
      expect(result).toBe(1);
    });
  });

  describe('pub/sub operations', () => {
    it('should publish message', async () => {
      mockRedis.publish.mockResolvedValue(1);

      const result = await redisService.publish('channel', 'message');

      expect(mockRedis.publish).toHaveBeenCalledWith('channel', 'message');
      expect(result).toBe(1);
    });

    it('should subscribe to channel', async () => {
      const mockSubscriber = {
        subscribe: jest.fn().mockResolvedValue(undefined),
        on: jest.fn(),
      };
      mockRedis.duplicate.mockReturnValue(mockSubscriber as any);

      const callback = jest.fn();
      await redisService.subscribe('channel', callback);

      expect(mockRedis.duplicate).toHaveBeenCalled();
      expect(mockSubscriber.subscribe).toHaveBeenCalledWith('channel');
      expect(mockSubscriber.on).toHaveBeenCalledWith('message', expect.any(Function));
    });
  });

  describe('advanced operations', () => {
    it('should create pipeline', async () => {
      const mockPipeline = {};
      mockRedis.pipeline.mockReturnValue(mockPipeline);

      const result = await redisService.pipeline();

      expect(mockRedis.pipeline).toHaveBeenCalled();
      expect(result).toBe(mockPipeline);
    });

    it('should create multi', async () => {
      const mockMulti = {};
      mockRedis.multi.mockReturnValue(mockMulti);

      const result = await redisService.multi();

      expect(mockRedis.multi).toHaveBeenCalled();
      expect(result).toBe(mockMulti);
    });

    it('should flush database', async () => {
      mockRedis.flushdb.mockResolvedValue('OK');

      const result = await redisService.flushdb();

      expect(mockRedis.flushdb).toHaveBeenCalled();
      expect(result).toBe('OK');
    });

    it('should get keys by pattern', async () => {
      const keys = ['key1', 'key2', 'key3'];
      mockRedis.keys.mockResolvedValue(keys);

      const result = await redisService.keys('test:*');

      expect(mockRedis.keys).toHaveBeenCalledWith('test:*');
      expect(result).toEqual(keys);
    });

    it('should ping Redis', async () => {
      mockRedis.ping.mockResolvedValue('PONG');

      const result = await redisService.ping();

      expect(mockRedis.ping).toHaveBeenCalled();
      expect(result).toBe('PONG');
    });
  });

  describe('statistics', () => {
    it('should get stats', async () => {
      mockRedis.info.mockResolvedValue('used_memory:1048576\nother_info:value');
      mockRedis.dbsize.mockResolvedValue(100);

      const result = await redisService.getStats();

      expect(mockRedis.info).toHaveBeenCalledWith('memory');
      expect(mockRedis.dbsize).toHaveBeenCalled();
      expect(result).toMatchObject({
        totalKeys: 100,
        memoryUsage: 1048576,
        uptime: expect.any(Number),
      });
    });

    it('should reset stats', () => {
      redisService.resetStats();

      // Verify stats are reset by checking internal state
      const stats = (redisService as any).stats;
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.sets).toBe(0);
      expect(stats.deletes).toBe(0);
      expect(stats.errors).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should track errors in stats', async () => {
      const error = new Error('Redis operation failed');
      mockRedis.get.mockRejectedValue(error);

      await expect(redisService.get('test-key')).rejects.toThrow('Redis operation failed');

      const stats = await redisService.getStats();
      expect(stats.errors).toBeGreaterThan(0);
    });

    it('should track hits and misses', async () => {
      // Test hit
      mockRedis.get.mockResolvedValueOnce(JSON.stringify({ data: 'test' }));
      await redisService.get('existing-key');

      // Test miss
      mockRedis.get.mockResolvedValueOnce(null);
      await redisService.get('non-existing-key');

      const stats = await redisService.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });
  });

  describe('client access', () => {
    it('should return Redis client', () => {
      const client = redisService.getClient();
      expect(client).toBe(mockRedis);
    });
  });
});
