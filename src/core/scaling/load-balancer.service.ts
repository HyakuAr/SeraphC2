/**
 * Load balancer service for horizontal scaling
 * Distributes requests across multiple server instances
 */

import { EventEmitter } from 'events';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';

export interface ServerNode {
  id: string;
  host: string;
  port: number;
  protocol: 'http' | 'https';
  weight: number;
  isHealthy: boolean;
  lastHealthCheck: Date | null;
  responseTime: number;
  activeConnections: number;
  maxConnections: number;
  metadata?: Record<string, any>;
}

export interface LoadBalancerConfig {
  algorithm:
    | 'round-robin'
    | 'weighted-round-robin'
    | 'least-connections'
    | 'least-response-time'
    | 'ip-hash';
  healthCheckInterval: number;
  healthCheckTimeout: number;
  healthCheckPath: string;
  maxRetries: number;
  retryDelay: number;
  enableStickySessions: boolean;
  sessionAffinityKey?: string;
  enableCircuitBreaker: boolean;
  circuitBreakerThreshold: number;
  circuitBreakerTimeout: number;
}

export interface RequestContext {
  clientId?: string;
  sessionId?: string;
  ipAddress?: string;
  headers?: Record<string, string>;
  metadata?: Record<string, any>;
}

export interface LoadBalancerStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  requestsPerSecond: number;
  nodeStats: Record<
    string,
    {
      requests: number;
      failures: number;
      averageResponseTime: number;
      lastUsed: Date;
    }
  >;
}

export class LoadBalancerService extends EventEmitter {
  private nodes: Map<string, ServerNode> = new Map();
  private config: LoadBalancerConfig;
  private currentIndex: number = 0;
  private sessionAffinity: Map<string, string> = new Map();
  private circuitBreakers: Map<string, { isOpen: boolean; failures: number; lastFailure: Date }> =
    new Map();
  private stats: LoadBalancerStats;
  private healthCheckInterval?: NodeJS.Timeout;
  private httpClient: AxiosInstance;

  constructor(config: LoadBalancerConfig) {
    super();
    this.config = config;
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      requestsPerSecond: 0,
      nodeStats: {},
    };

    this.httpClient = axios.create({
      timeout: this.config.healthCheckTimeout,
      validateStatus: status => status >= 200 && status < 300,
    });

    this.startHealthChecks();
  }

  /**
   * Add a server node to the load balancer
   */
  public addNode(node: ServerNode): void {
    this.nodes.set(node.id, {
      ...node,
      isHealthy: false,
      lastHealthCheck: null,
      responseTime: 0,
      activeConnections: 0,
    });

    this.stats.nodeStats[node.id] = {
      requests: 0,
      failures: 0,
      averageResponseTime: 0,
      lastUsed: new Date(),
    };

    this.circuitBreakers.set(node.id, {
      isOpen: false,
      failures: 0,
      lastFailure: new Date(0),
    });

    console.log(`➕ Added server node: ${node.id} (${node.host}:${node.port})`);
    this.emit('nodeAdded', node);
  }

  /**
   * Remove a server node from the load balancer
   */
  public removeNode(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (node) {
      this.nodes.delete(nodeId);
      delete this.stats.nodeStats[nodeId];
      this.circuitBreakers.delete(nodeId);

      // Remove session affinity entries for this node
      for (const [sessionId, assignedNodeId] of this.sessionAffinity.entries()) {
        if (assignedNodeId === nodeId) {
          this.sessionAffinity.delete(sessionId);
        }
      }

      console.log(`➖ Removed server node: ${nodeId}`);
      this.emit('nodeRemoved', node);
    }
  }

  /**
   * Get the next available server node based on load balancing algorithm
   */
  public getNextNode(context?: RequestContext): ServerNode | null {
    const healthyNodes = Array.from(this.nodes.values()).filter(
      node => node.isHealthy && !this.isCircuitBreakerOpen(node.id)
    );

    if (healthyNodes.length === 0) {
      console.warn('⚠️ No healthy nodes available');
      return null;
    }

    // Check for session affinity
    if (this.config.enableStickySessions && context?.sessionId) {
      const affinityNodeId = this.sessionAffinity.get(context.sessionId);
      if (affinityNodeId) {
        const affinityNode = this.nodes.get(affinityNodeId);
        if (affinityNode && affinityNode.isHealthy && !this.isCircuitBreakerOpen(affinityNodeId)) {
          return affinityNode;
        } else {
          // Remove stale affinity
          this.sessionAffinity.delete(context.sessionId);
        }
      }
    }

    let selectedNode: ServerNode;

    switch (this.config.algorithm) {
      case 'round-robin':
        selectedNode = this.roundRobinSelection(healthyNodes);
        break;
      case 'weighted-round-robin':
        selectedNode = this.weightedRoundRobinSelection(healthyNodes);
        break;
      case 'least-connections':
        selectedNode = this.leastConnectionsSelection(healthyNodes);
        break;
      case 'least-response-time':
        selectedNode = this.leastResponseTimeSelection(healthyNodes);
        break;
      case 'ip-hash':
        selectedNode = this.ipHashSelection(healthyNodes, context?.ipAddress);
        break;
      default:
        selectedNode = this.roundRobinSelection(healthyNodes);
    }

    // Set session affinity if enabled
    if (this.config.enableStickySessions && context?.sessionId) {
      this.sessionAffinity.set(context.sessionId, selectedNode.id);
    }

    return selectedNode;
  }

  /**
   * Execute a request through the load balancer
   */
  public async executeRequest<T = any>(
    path: string,
    options: AxiosRequestConfig = {},
    context?: RequestContext
  ): Promise<T> {
    const startTime = Date.now();
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      const node = this.getNextNode(context);

      if (!node) {
        throw new Error('No healthy nodes available for request');
      }

      try {
        const url = `${node.protocol}://${node.host}:${node.port}${path}`;
        const response = await this.httpClient.request<T>({
          ...options,
          url,
        });

        // Update metrics
        const responseTime = Date.now() - startTime;
        this.updateRequestMetrics(node.id, responseTime, true);
        this.updateNodeResponseTime(node.id, responseTime);

        return response.data;
      } catch (error) {
        lastError = error as Error;
        const responseTime = Date.now() - startTime;

        this.updateRequestMetrics(node.id, responseTime, false);
        this.handleNodeFailure(node.id);

        console.warn(
          `⚠️ Request failed on node ${node.id}, attempt ${attempt + 1}/${this.config.maxRetries + 1}`
        );

        if (attempt < this.config.maxRetries) {
          await this.delay(this.config.retryDelay);
        }
      }
    }

    throw lastError || new Error('All retry attempts failed');
  }

  /**
   * Get load balancer statistics
   */
  public getStats(): LoadBalancerStats {
    return { ...this.stats };
  }

  /**
   * Get current node status
   */
  public getNodeStatus(): ServerNode[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Get healthy nodes count
   */
  public getHealthyNodesCount(): number {
    return Array.from(this.nodes.values()).filter(node => node.isHealthy).length;
  }

  /**
   * Force health check on all nodes
   */
  public async forceHealthCheck(): Promise<void> {
    const promises = Array.from(this.nodes.keys()).map(nodeId => this.checkNodeHealth(nodeId));
    await Promise.allSettled(promises);
  }

  /**
   * Reset circuit breaker for a node
   */
  public resetCircuitBreaker(nodeId: string): void {
    const circuitBreaker = this.circuitBreakers.get(nodeId);
    if (circuitBreaker) {
      circuitBreaker.isOpen = false;
      circuitBreaker.failures = 0;
      console.log(`🔄 Circuit breaker reset for node: ${nodeId}`);
    }
  }

  /**
   * Shutdown the load balancer
   */
  public shutdown(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.nodes.clear();
    this.sessionAffinity.clear();
    this.circuitBreakers.clear();

    console.log('🛑 Load balancer shutdown complete');
    this.emit('shutdown');
  }

  // Load balancing algorithms
  private roundRobinSelection(nodes: ServerNode[]): ServerNode {
    const node = nodes[this.currentIndex % nodes.length];
    this.currentIndex = (this.currentIndex + 1) % nodes.length;
    return node!;
  }

  private weightedRoundRobinSelection(nodes: ServerNode[]): ServerNode {
    const totalWeight = nodes.reduce((sum, node) => sum + node.weight, 0);
    let randomWeight = Math.random() * totalWeight;

    for (const node of nodes) {
      randomWeight -= node.weight;
      if (randomWeight <= 0) {
        return node;
      }
    }

    return nodes[0]!; // Fallback
  }

  private leastConnectionsSelection(nodes: ServerNode[]): ServerNode {
    return nodes.reduce((min, node) =>
      node.activeConnections < min.activeConnections ? node : min
    );
  }

  private leastResponseTimeSelection(nodes: ServerNode[]): ServerNode {
    return nodes.reduce((min, node) => (node.responseTime < min.responseTime ? node : min));
  }

  private ipHashSelection(nodes: ServerNode[], ipAddress?: string): ServerNode {
    if (!ipAddress) {
      return this.roundRobinSelection(nodes);
    }

    // Simple hash function for IP address
    let hash = 0;
    for (let i = 0; i < ipAddress.length; i++) {
      const char = ipAddress.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    const index = Math.abs(hash) % nodes.length;
    return nodes[index]!;
  }

  // Health checking
  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      const promises = Array.from(this.nodes.keys()).map(nodeId => this.checkNodeHealth(nodeId));
      await Promise.allSettled(promises);
    }, this.config.healthCheckInterval);
  }

  private async checkNodeHealth(nodeId: string): Promise<void> {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    try {
      const startTime = Date.now();
      const url = `${node.protocol}://${node.host}:${node.port}${this.config.healthCheckPath}`;

      await this.httpClient.get(url);

      const responseTime = Date.now() - startTime;
      node.responseTime = responseTime;
      node.lastHealthCheck = new Date();

      if (!node.isHealthy) {
        node.isHealthy = true;
        console.log(`✅ Node ${nodeId} is now healthy`);
        this.emit('nodeHealthy', node);
      }

      // Reset circuit breaker on successful health check
      if (this.config.enableCircuitBreaker) {
        this.resetCircuitBreaker(nodeId);
      }
    } catch (error) {
      node.lastHealthCheck = new Date();

      if (node.isHealthy) {
        node.isHealthy = false;
        console.warn(`❌ Node ${nodeId} is now unhealthy:`, error);
        this.emit('nodeUnhealthy', node, error);
      }
    }
  }

  // Circuit breaker logic
  private isCircuitBreakerOpen(nodeId: string): boolean {
    if (!this.config.enableCircuitBreaker) {
      return false;
    }

    const circuitBreaker = this.circuitBreakers.get(nodeId);
    if (!circuitBreaker) {
      return false;
    }

    if (circuitBreaker.isOpen) {
      // Check if timeout has passed
      const timeSinceLastFailure = Date.now() - circuitBreaker.lastFailure.getTime();
      if (timeSinceLastFailure > this.config.circuitBreakerTimeout) {
        circuitBreaker.isOpen = false;
        circuitBreaker.failures = 0;
        console.log(`🔄 Circuit breaker timeout expired for node: ${nodeId}`);
      }
    }

    return circuitBreaker.isOpen;
  }

  private handleNodeFailure(nodeId: string): void {
    if (!this.config.enableCircuitBreaker) {
      return;
    }

    const circuitBreaker = this.circuitBreakers.get(nodeId);
    if (circuitBreaker) {
      circuitBreaker.failures++;
      circuitBreaker.lastFailure = new Date();

      if (circuitBreaker.failures >= this.config.circuitBreakerThreshold) {
        circuitBreaker.isOpen = true;
        console.warn(`⚡ Circuit breaker opened for node: ${nodeId}`);
        this.emit('circuitBreakerOpened', nodeId);
      }
    }
  }

  // Metrics and monitoring
  private updateRequestMetrics(nodeId: string, responseTime: number, success: boolean): void {
    this.stats.totalRequests++;

    if (success) {
      this.stats.successfulRequests++;
    } else {
      this.stats.failedRequests++;
    }

    // Update average response time
    this.stats.averageResponseTime =
      (this.stats.averageResponseTime * (this.stats.totalRequests - 1) + responseTime) /
      this.stats.totalRequests;

    // Update node-specific stats
    const nodeStats = this.stats.nodeStats[nodeId];
    if (nodeStats) {
      nodeStats.requests++;
      if (!success) {
        nodeStats.failures++;
      }
      nodeStats.averageResponseTime =
        (nodeStats.averageResponseTime * (nodeStats.requests - 1) + responseTime) /
        nodeStats.requests;
      nodeStats.lastUsed = new Date();
    }
  }

  private updateNodeResponseTime(nodeId: string, responseTime: number): void {
    const node = this.nodes.get(nodeId);
    if (node) {
      // Exponential moving average for response time
      node.responseTime = node.responseTime * 0.7 + responseTime * 0.3;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
