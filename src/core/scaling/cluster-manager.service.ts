/**
 * Cluster manager for horizontal scaling
 * Manages multiple server instances and coordinates distributed operations
 */

import { EventEmitter } from 'events';
import { RedisService } from '../cache/redis.service';
import { LoadBalancerService, ServerNode } from './load-balancer.service';

export interface ClusterNode {
  id: string;
  host: string;
  port: number;
  role: 'primary' | 'secondary' | 'worker';
  status: 'active' | 'inactive' | 'maintenance' | 'failed';
  startTime: Date;
  lastHeartbeat: Date;
  version: string;
  capabilities: string[];
  load: {
    cpu: number;
    memory: number;
    connections: number;
    requestsPerSecond: number;
  };
  metadata?: Record<string, any>;
}

export interface ClusterConfig {
  nodeId: string;
  role: 'primary' | 'secondary' | 'worker';
  heartbeatInterval: number;
  heartbeatTimeout: number;
  electionTimeout: number;
  enableAutoScaling: boolean;
  minNodes: number;
  maxNodes: number;
  scaleUpThreshold: number;
  scaleDownThreshold: number;
  loadBalancerConfig: any;
}

export interface ClusterStats {
  totalNodes: number;
  activeNodes: number;
  primaryNode: string | null;
  totalConnections: number;
  totalRequestsPerSecond: number;
  averageLoad: {
    cpu: number;
    memory: number;
  };
  clusterHealth: 'healthy' | 'degraded' | 'critical';
}

export class ClusterManagerService extends EventEmitter {
  private static instance: ClusterManagerService;
  private redis: RedisService;
  private loadBalancer: LoadBalancerService;
  private config: ClusterConfig;
  private currentNode: ClusterNode;
  private nodes: Map<string, ClusterNode> = new Map();
  private isPrimary: boolean = false;
  private heartbeatInterval?: NodeJS.Timeout;
  private electionTimeout?: NodeJS.Timeout;
  private monitoringInterval?: NodeJS.Timeout;

  private constructor(config: ClusterConfig, redis: RedisService) {
    super();
    this.config = config;
    this.redis = redis;

    this.currentNode = {
      id: config.nodeId,
      host: process.env.HOST || 'localhost',
      port: parseInt(process.env.PORT || '3000'),
      role: config.role,
      status: 'active',
      startTime: new Date(),
      lastHeartbeat: new Date(),
      version: process.env.npm_package_version || '1.0.0',
      capabilities: ['api', 'websocket', 'file-operations', 'command-execution'],
      load: {
        cpu: 0,
        memory: 0,
        connections: 0,
        requestsPerSecond: 0,
      },
    };

    this.loadBalancer = new LoadBalancerService(config.loadBalancerConfig);
    this.initializeCluster();
  }

  public static getInstance(config?: ClusterConfig, redis?: RedisService): ClusterManagerService {
    if (!ClusterManagerService.instance) {
      if (!config || !redis) {
        throw new Error('Configuration and Redis service required for first initialization');
      }
      ClusterManagerService.instance = new ClusterManagerService(config, redis);
    }
    return ClusterManagerService.instance;
  }

  private async initializeCluster(): Promise<void> {
    try {
      // Register this node in the cluster
      await this.registerNode();

      // Start heartbeat
      this.startHeartbeat();

      // Start monitoring other nodes
      this.startNodeMonitoring();

      // Start leader election if this is a primary/secondary node
      if (this.config.role !== 'worker') {
        await this.startLeaderElection();
      }

      // Load existing nodes from Redis
      await this.loadExistingNodes();

      console.log(`🌐 Cluster node ${this.config.nodeId} initialized as ${this.config.role}`);
      this.emit('initialized');
    } catch (error) {
      console.error('❌ Failed to initialize cluster:', error);
      throw error;
    }
  }

  public async start(): Promise<void> {
    try {
      await this.initializeCluster();

      // Start auto-scaling if enabled
      if (this.config.enableAutoScaling && this.isPrimary) {
        this.startAutoScaling();
      }

      console.log(`✅ Cluster manager started for node ${this.config.nodeId}`);
    } catch (error) {
      console.error('❌ Failed to start cluster manager:', error);
      throw error;
    }
  }

  public async stop(): Promise<void> {
    try {
      // Clear intervals
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
      }

      if (this.electionTimeout) {
        clearTimeout(this.electionTimeout);
      }

      if (this.monitoringInterval) {
        clearInterval(this.monitoringInterval);
      }

      // Unregister this node
      await this.unregisterNode();

      // Shutdown load balancer
      this.loadBalancer.shutdown();

      console.log(`✅ Cluster manager stopped for node ${this.config.nodeId}`);
      this.emit('stopped');
    } catch (error) {
      console.error('❌ Error stopping cluster manager:', error);
      throw error;
    }
  }

  public getClusterStats(): ClusterStats {
    const activeNodes = Array.from(this.nodes.values()).filter(node => node.status === 'active');
    const totalConnections = activeNodes.reduce((sum, node) => sum + node.load.connections, 0);
    const totalRps = activeNodes.reduce((sum, node) => sum + node.load.requestsPerSecond, 0);

    const avgCpu =
      activeNodes.length > 0
        ? activeNodes.reduce((sum, node) => sum + node.load.cpu, 0) / activeNodes.length
        : 0;

    const avgMemory =
      activeNodes.length > 0
        ? activeNodes.reduce((sum, node) => sum + node.load.memory, 0) / activeNodes.length
        : 0;

    let clusterHealth: 'healthy' | 'degraded' | 'critical' = 'healthy';

    if (activeNodes.length < this.config.minNodes) {
      clusterHealth = 'critical';
    } else if (avgCpu > 80 || avgMemory > 80) {
      clusterHealth = 'degraded';
    }

    return {
      totalNodes: this.nodes.size,
      activeNodes: activeNodes.length,
      primaryNode: this.getPrimaryNode()?.id || null,
      totalConnections,
      totalRequestsPerSecond: totalRps,
      averageLoad: {
        cpu: avgCpu,
        memory: avgMemory,
      },
      clusterHealth,
    };
  }

  public getNodes(): ClusterNode[] {
    return Array.from(this.nodes.values());
  }

  public getActiveNodes(): ClusterNode[] {
    return Array.from(this.nodes.values()).filter(node => node.status === 'active');
  }

  public getPrimaryNode(): ClusterNode | null {
    return (
      Array.from(this.nodes.values()).find(
        node => node.role === 'primary' && node.status === 'active'
      ) || null
    );
  }

  public isPrimaryNode(): boolean {
    return this.isPrimary;
  }

  public async promoteToSecondary(): Promise<void> {
    if (this.config.role === 'worker') {
      this.config.role = 'secondary';
      this.currentNode.role = 'secondary';
      await this.updateNodeInfo();
      console.log(`📈 Node ${this.config.nodeId} promoted to secondary`);
      this.emit('promoted', 'secondary');
    }
  }

  public async demoteToWorker(): Promise<void> {
    if (this.config.role === 'secondary') {
      this.config.role = 'worker';
      this.currentNode.role = 'worker';
      this.isPrimary = false;
      await this.updateNodeInfo();
      console.log(`📉 Node ${this.config.nodeId} demoted to worker`);
      this.emit('demoted', 'worker');
    }
  }

  public getLoadBalancer(): LoadBalancerService {
    return this.loadBalancer;
  }

  public async distributeTask(task: any, targetNodes?: string[]): Promise<any[]> {
    const nodes = targetNodes
      ? this.getActiveNodes().filter(node => targetNodes.includes(node.id))
      : this.getActiveNodes();

    if (nodes.length === 0) {
      throw new Error('No active nodes available for task distribution');
    }

    const promises = nodes.map(async node => {
      try {
        // In a real implementation, this would make HTTP requests to other nodes
        // For now, we'll simulate task distribution
        const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        await this.redis.set(
          `distributed_task:${taskId}`,
          {
            task,
            nodeId: node.id,
            status: 'pending',
            createdAt: new Date(),
          },
          3600
        ); // 1 hour TTL

        return { nodeId: node.id, taskId, status: 'submitted' };
      } catch (error) {
        console.error(`❌ Failed to distribute task to node ${node.id}:`, error);
        return { nodeId: node.id, error: error.message, status: 'failed' };
      }
    });

    return Promise.all(promises);
  }

  private async registerNode(): Promise<void> {
    const key = `cluster:nodes:${this.config.nodeId}`;
    await this.redis.set(key, this.currentNode, this.config.heartbeatTimeout * 2);

    // Add to active nodes set
    await this.redis.sadd('cluster:active_nodes', this.config.nodeId);

    console.log(`📝 Registered node ${this.config.nodeId} in cluster`);
  }

  private async unregisterNode(): Promise<void> {
    const key = `cluster:nodes:${this.config.nodeId}`;
    await this.redis.del(key);

    // Remove from active nodes set
    await this.redis.srem('cluster:active_nodes', this.config.nodeId);

    console.log(`🗑️ Unregistered node ${this.config.nodeId} from cluster`);
  }

  private async updateNodeInfo(): Promise<void> {
    // Update load information
    this.currentNode.load = await this.getCurrentLoad();
    this.currentNode.lastHeartbeat = new Date();

    const key = `cluster:nodes:${this.config.nodeId}`;
    await this.redis.set(key, this.currentNode, this.config.heartbeatTimeout * 2);
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(async () => {
      try {
        await this.updateNodeInfo();
      } catch (error) {
        console.error('❌ Heartbeat failed:', error);
      }
    }, this.config.heartbeatInterval);
  }

  private startNodeMonitoring(): void {
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.discoverNodes();
        await this.checkNodeHealth();
        await this.updateLoadBalancer();
      } catch (error) {
        console.error('❌ Node monitoring failed:', error);
      }
    }, this.config.heartbeatInterval * 2);
  }

  private async loadExistingNodes(): Promise<void> {
    try {
      const activeNodeIds = await this.redis.smembers('cluster:active_nodes');

      for (const nodeId of activeNodeIds) {
        if (nodeId !== this.config.nodeId) {
          const nodeData = await this.redis.get<ClusterNode>(`cluster:nodes:${nodeId}`);
          if (nodeData) {
            this.nodes.set(nodeId, {
              ...nodeData,
              lastHeartbeat: new Date(nodeData.lastHeartbeat),
              startTime: new Date(nodeData.startTime),
            });
          }
        }
      }

      console.log(`📋 Loaded ${this.nodes.size} existing cluster nodes`);
    } catch (error) {
      console.error('❌ Failed to load existing nodes:', error);
    }
  }

  private async discoverNodes(): Promise<void> {
    try {
      const activeNodeIds = await this.redis.smembers('cluster:active_nodes');

      for (const nodeId of activeNodeIds) {
        if (nodeId !== this.config.nodeId && !this.nodes.has(nodeId)) {
          const nodeData = await this.redis.get<ClusterNode>(`cluster:nodes:${nodeId}`);
          if (nodeData) {
            this.nodes.set(nodeId, {
              ...nodeData,
              lastHeartbeat: new Date(nodeData.lastHeartbeat),
              startTime: new Date(nodeData.startTime),
            });

            console.log(`🔍 Discovered new node: ${nodeId}`);
            this.emit('nodeDiscovered', nodeData);
          }
        }
      }
    } catch (error) {
      console.error('❌ Node discovery failed:', error);
    }
  }

  private async checkNodeHealth(): Promise<void> {
    const now = new Date();
    const timeoutMs = this.config.heartbeatTimeout * 1000;

    for (const [nodeId, node] of this.nodes.entries()) {
      const timeSinceHeartbeat = now.getTime() - node.lastHeartbeat.getTime();

      if (timeSinceHeartbeat > timeoutMs && node.status === 'active') {
        node.status = 'failed';
        console.warn(
          `⚠️ Node ${nodeId} marked as failed (no heartbeat for ${timeSinceHeartbeat}ms)`
        );
        this.emit('nodeFailure', node);

        // Remove from Redis if we're the primary
        if (this.isPrimary) {
          await this.redis.srem('cluster:active_nodes', nodeId);
        }
      }
    }
  }

  private async updateLoadBalancer(): Promise<void> {
    const activeNodes = this.getActiveNodes();

    // Update load balancer with current active nodes
    for (const node of activeNodes) {
      const serverNode: ServerNode = {
        id: node.id,
        host: node.host,
        port: node.port,
        protocol: 'http',
        weight: this.calculateNodeWeight(node),
        isHealthy: node.status === 'active',
        lastHealthCheck: node.lastHeartbeat,
        responseTime: 0, // Will be updated by load balancer
        activeConnections: node.load.connections,
        maxConnections: 1000, // Configure based on node capacity
      };

      // Add or update node in load balancer
      this.loadBalancer.addNode(serverNode);
    }
  }

  private calculateNodeWeight(node: ClusterNode): number {
    // Calculate weight based on current load (inverse relationship)
    const cpuWeight = Math.max(1, 100 - node.load.cpu);
    const memoryWeight = Math.max(1, 100 - node.load.memory);
    const connectionWeight = Math.max(1, 100 - node.load.connections / 10);

    return Math.floor((cpuWeight + memoryWeight + connectionWeight) / 3);
  }

  private async startLeaderElection(): Promise<void> {
    try {
      // Try to acquire leadership
      const lockKey = 'cluster:leader_lock';
      const lockValue = this.config.nodeId;
      const lockTtl = this.config.electionTimeout;

      // Use Redis SET with NX (only if not exists) and EX (expiration)
      const result = await this.redis.getClient().set(lockKey, lockValue, 'PX', lockTtl, 'NX');

      if (result === 'OK') {
        this.isPrimary = true;
        this.currentNode.role = 'primary';
        console.log(`👑 Node ${this.config.nodeId} elected as primary`);
        this.emit('becamePrimary');

        // Renew leadership periodically
        this.renewLeadership();
      } else {
        // Check who is the current leader
        const currentLeader = await this.redis.get(lockKey);
        console.log(`📊 Node ${currentLeader} is the current primary`);

        // Schedule next election attempt
        this.scheduleElection();
      }
    } catch (error) {
      console.error('❌ Leader election failed:', error);
      this.scheduleElection();
    }
  }

  private renewLeadership(): void {
    if (!this.isPrimary) return;

    this.electionTimeout = setTimeout(async () => {
      try {
        const lockKey = 'cluster:leader_lock';
        const lockValue = this.config.nodeId;
        const lockTtl = this.config.electionTimeout;

        // Renew the lock
        const currentLeader = await this.redis.get(lockKey);
        if (currentLeader === this.config.nodeId) {
          await this.redis.getClient().set(lockKey, lockValue, 'PX', lockTtl);
          this.renewLeadership(); // Schedule next renewal
        } else {
          // Lost leadership
          this.isPrimary = false;
          this.currentNode.role = 'secondary';
          console.log(`👑 Lost primary role to ${currentLeader}`);
          this.emit('lostPrimary');
          this.scheduleElection();
        }
      } catch (error) {
        console.error('❌ Leadership renewal failed:', error);
        this.isPrimary = false;
        this.scheduleElection();
      }
    }, this.config.electionTimeout / 2); // Renew at half the timeout
  }

  private scheduleElection(): void {
    this.electionTimeout = setTimeout(
      () => {
        this.startLeaderElection();
      },
      this.config.electionTimeout + Math.random() * 1000
    ); // Add jitter
  }

  private startAutoScaling(): void {
    setInterval(async () => {
      if (!this.isPrimary) return;

      try {
        const stats = this.getClusterStats();

        // Scale up if needed
        if (
          stats.averageLoad.cpu > this.config.scaleUpThreshold &&
          stats.activeNodes < this.config.maxNodes
        ) {
          console.log('📈 Auto-scaling: Triggering scale-up');
          this.emit('scaleUp', stats);
        }

        // Scale down if needed
        if (
          stats.averageLoad.cpu < this.config.scaleDownThreshold &&
          stats.activeNodes > this.config.minNodes
        ) {
          console.log('📉 Auto-scaling: Triggering scale-down');
          this.emit('scaleDown', stats);
        }
      } catch (error) {
        console.error('❌ Auto-scaling check failed:', error);
      }
    }, 60000); // Check every minute
  }

  private async getCurrentLoad(): Promise<ClusterNode['load']> {
    // In a real implementation, this would gather actual system metrics
    // For now, we'll return mock data
    return {
      cpu: Math.random() * 100,
      memory: Math.random() * 100,
      connections: Math.floor(Math.random() * 1000),
      requestsPerSecond: Math.floor(Math.random() * 100),
    };
  }
}
