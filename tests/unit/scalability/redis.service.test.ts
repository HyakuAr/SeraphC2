/**
 * Unit tests for Redis service
 */

import { RedisService, CacheConfig } from '../../../src/core/cache/redis.service';

// Mock ioredis
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
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
    subscribe: jest.fn(),
    duplicate: jest.fn().mockReturnThis(),
    pipeline: jest.fn(),
    multi: jest.fn(),
    flushdb: jest.fn(),
    keys: jest.fn(),
    info: jest.fn(),
    dbsize: jest.fn(),
    ping: jest.fn(),
    on: jest.fn(),
    status: 'ready',
  }));
});

describe('RedisService', () => {
  let redisService: RedisService;
  let mockRedis: any;

  const config: CacheConfig = {
    host: 'localhost',
    port: 6379,
    keyPrefix: 'test:',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    redisService = RedisService.getInstance(config);
    mockRedis = (redisService as any).redis;
  });

  afterEach(() => {
    // Reset singleton instance
    (RedisService as any).instance = null;
  });

  describe('initialization', () => {
    it('should create Redis instance with correct configuration', () => {
      expect(mockRedis).toBeDefined();
      expect(mockRedis.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockRedis.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should return same instance on subsequent calls', () => {
      const instance1 = RedisService.getInstance();
      const instance2 = RedisService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('basic operations', () => {
    it('should get value from Redis', async () => {
      const testValue = { test: 'data' };
      mockRedis.get.mockResolvedValue(JSON.stringify(testValue));

      const result = await redisService.get('test-key');

      expect(mockRedis.get).toHaveBeenCalledWith('test-key');
      expect(result).toEqual(testValue);
    });

    it('should return null for non-existent key', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await redisService.get('non-existent');

      expect(result).toBeNull();
    });

    it('should set value in Redis', async () => {
      const testValue = { test: 'data' };
      mockRedis.set.mockResolvedValue('OK');

      await redisService.set('test-key', testValue);

      expect(mockRedis.set).toHaveBeenCalledWith('test-key', JSON.stringify(testValue));
    });

    it('should set value with TTL', async () => {
      const testValue = { test: 'data' };
      mockRedis.setex.mockResolvedValue('OK');

      await redisService.set('test-key', testValue, 3600);

      expect(mockRedis.setex).toHaveBeenCalledWith('test-key', 3600, JSON.stringify(testValue));
    });

    it('should delete key from Redis', async () => {
      mockRedis.del.mockResolvedValue(1);

      const result = await redisService.del('test-key');

      expect(mockRedis.del).toHaveBeenCalledWith('test-key');
      expect(result).toBe(1);
    });

    it('should check if key exists', async () => {
      mockRedis.exists.mockResolvedValue(1);

      const result = await redisService.exists('test-key');

      expect(mockRedis.exists).toHaveBeenCalledWith('test-key');
      expect(result).toBe(true);
    });
  });

  describe('hash operations', () => {
    it('should get hash field', async () => {
      mockRedis.hget.mockResolvedValue('test-value');

      const result = await redisService.hget('test-hash', 'field');

      expect(mockRedis.hget).toHaveBeenCalledWith('test-hash', 'field');
      expect(result).toBe('test-value');
    });

    it('should set hash field', async () => {
      mockRedis.hset.mockResolvedValue(1);

      const result = await redisService.hset('test-hash', 'field', 'value');

      expect(mockRedis.hset).toHaveBeenCalledWith('test-hash', 'field', 'value');
      expect(result).toBe(1);
    });

    it('should get all hash fields', async () => {
      const hashData = { field1: 'value1', field2: 'value2' };
      mockRedis.hgetall.mockResolvedValue(hashData);

      const result = await redisService.hgetall('test-hash');

      expect(mockRedis.hgetall).toHaveBeenCalledWith('test-hash');
      expect(result).toEqual(hashData);
    });
  });

  describe('list operations', () => {
    it('should push to list', async () => {
      mockRedis.lpush.mockResolvedValue(2);

      const result = await redisService.lpush('test-list', 'item1', 'item2');

      expect(mockRedis.lpush).toHaveBeenCalledWith('test-list', 'item1', 'item2');
      expect(result).toBe(2);
    });

    it('should pop from list', async () => {
      mockRedis.rpop.mockResolvedValue('item');

      const result = await redisService.rpop('test-list');

      expect(mockRedis.rpop).toHaveBeenCalledWith('test-list');
      expect(result).toBe('item');
    });

    it('should get list length', async () => {
      mockRedis.llen.mockResolvedValue(5);

      const result = await redisService.llen('test-list');

      expect(mockRedis.llen).toHaveBeenCalledWith('test-list');
      expect(result).toBe(5);
    });

    it('should get list range', async () => {
      const listItems = ['item1', 'item2', 'item3'];
      mockRedis.lrange.mockResolvedValue(listItems);

      const result = await redisService.lrange('test-list', 0, -1);

      expect(mockRedis.lrange).toHaveBeenCalledWith('test-list', 0, -1);
      expect(result).toEqual(listItems);
    });
  });

  describe('set operations', () => {
    it('should add to set', async () => {
      mockRedis.sadd.mockResolvedValue(2);

      const result = await redisService.sadd('test-set', 'member1', 'member2');

      expect(mockRedis.sadd).toHaveBeenCalledWith('test-set', 'member1', 'member2');
      expect(result).toBe(2);
    });

    it('should remove from set', async () => {
      mockRedis.srem.mockResolvedValue(1);

      const result = await redisService.srem('test-set', 'member1');

      expect(mockRedis.srem).toHaveBeenCalledWith('test-set', 'member1');
      expect(result).toBe(1);
    });

    it('should get set members', async () => {
      const members = ['member1', 'member2'];
      mockRedis.smembers.mockResolvedValue(members);

      const result = await redisService.smembers('test-set');

      expect(mockRedis.smembers).toHaveBeenCalledWith('test-set');
      expect(result).toEqual(members);
    });

    it('should check set membership', async () => {
      mockRedis.sismember.mockResolvedValue(1);

      const result = await redisService.sismember('test-set', 'member1');

      expect(mockRedis.sismember).toHaveBeenCalledWith('test-set', 'member1');
      expect(result).toBe(true);
    });
  });

  describe('sorted set operations', () => {
    it('should add to sorted set', async () => {
      mockRedis.zadd.mockResolvedValue(1);

      const result = await redisService.zadd('test-zset', 100, 'member');

      expect(mockRedis.zadd).toHaveBeenCalledWith('test-zset', 100, 'member');
      expect(result).toBe(1);
    });

    it('should get sorted set range', async () => {
      const members = ['member1', 'member2'];
      mockRedis.zrange.mockResolvedValue(members);

      const result = await redisService.zrange('test-zset', 0, -1);

      expect(mockRedis.zrange).toHaveBeenCalledWith('test-zset', 0, -1);
      expect(result).toEqual(members);
    });

    it('should get sorted set range with scores', async () => {
      const membersWithScores = ['member1', '100', 'member2', '200'];
      mockRedis.zrange.mockResolvedValue(membersWithScores);

      const result = await redisService.zrange('test-zset', 0, -1, true);

      expect(mockRedis.zrange).toHaveBeenCalledWith('test-zset', 0, -1, 'WITHSCORES');
      expect(result).toEqual(membersWithScores);
    });
  });

  describe('pub/sub operations', () => {
    it('should publish message', async () => {
      mockRedis.publish.mockResolvedValue(1);

      const result = await redisService.publish('test-channel', 'test-message');

      expect(mockRedis.publish).toHaveBeenCalledWith('test-channel', 'test-message');
      expect(result).toBe(1);
    });

    it('should subscribe to channel', async () => {
      const mockSubscriber = {
        subscribe: jest.fn().mockResolvedValue(undefined),
        on: jest.fn(),
      };
      mockRedis.duplicate.mockReturnValue(mockSubscriber);

      const callback = jest.fn();
      await redisService.subscribe('test-channel', callback);

      expect(mockSubscriber.subscribe).toHaveBeenCalledWith('test-channel');
      expect(mockSubscriber.on).toHaveBeenCalledWith('message', expect.any(Function));
    });
  });

  describe('statistics', () => {
    it('should get statistics', async () => {
      mockRedis.info.mockResolvedValue('used_memory:1048576');
      mockRedis.dbsize.mockResolvedValue(100);

      const stats = await redisService.getStats();

      expect(stats).toHaveProperty('totalKeys', 100);
      expect(stats).toHaveProperty('memoryUsage', 1048576);
      expect(stats).toHaveProperty('uptime');
    });

    it('should reset statistics', () => {
      redisService.resetStats();

      // Verify stats are reset by checking initial values
      expect((redisService as any).stats.hits).toBe(0);
      expect((redisService as any).stats.misses).toBe(0);
    });
  });

  describe('health check', () => {
    it('should ping Redis', async () => {
      mockRedis.ping.mockResolvedValue('PONG');

      const result = await redisService.ping();

      expect(mockRedis.ping).toHaveBeenCalled();
      expect(result).toBe('PONG');
    });

    it('should report healthy status', () => {
      (redisService as any).isConnected = true;

      const isHealthy = redisService.isHealthy();

      expect(isHealthy).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle Redis errors gracefully', async () => {
      const error = new Error('Redis connection failed');
      mockRedis.get.mockRejectedValue(error);

      await expect(redisService.get('test-key')).rejects.toThrow('Redis connection failed');
    });

    it('should increment error count on failures', async () => {
      const error = new Error('Redis error');
      mockRedis.set.mockRejectedValue(error);

      try {
        await redisService.set('test-key', 'value');
      } catch (e) {
        // Expected to throw
      }

      expect((redisService as any).stats.errors).toBe(1);
    });
  });
});
