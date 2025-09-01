/**
 * Webhook service for external integrations
 */

import { Pool } from 'pg';
import { createHmac, randomUUID } from 'crypto';
import axios from 'axios';
import type { AxiosRequestConfig } from 'axios';

export interface WebhookConfig {
  id: string;
  name: string;
  url: string;
  events: string[];
  headers: Record<string, string>;
  secret?: string;
  isActive: boolean;
  retryCount: number;
  timeout: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookEvent {
  id: string;
  event: string;
  data: any;
  timestamp: Date;
  source: string;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  eventId: string;
  url: string;
  httpStatus?: number;
  responseBody?: string;
  errorMessage?: string;
  deliveredAt?: Date;
  attempts: number;
  nextRetryAt?: Date;
  createdAt: Date;
}

export interface CreateWebhookRequest {
  name: string;
  url: string;
  events: string[];
  headers?: Record<string, string>;
  secret?: string;
  retryCount?: number;
  timeout?: number;
}

export class WebhookService {
  private readonly supportedEvents = [
    'implant.connected',
    'implant.disconnected',
    'implant.heartbeat',
    'command.executed',
    'command.completed',
    'command.failed',
    'file.uploaded',
    'file.downloaded',
    'operator.login',
    'operator.logout',
    'task.scheduled',
    'task.completed',
    'task.failed',
    'alert.triggered',
    'module.loaded',
    'module.executed',
  ];

  constructor(private pool: Pool) {}

  /**
   * Create a new webhook configuration
   */
  async createWebhook(request: CreateWebhookRequest): Promise<WebhookConfig> {
    // Validate events
    const invalidEvents = request.events.filter(event => !this.supportedEvents.includes(event));
    if (invalidEvents.length > 0) {
      throw new Error(`Unsupported events: ${invalidEvents.join(', ')}`);
    }

    const id = randomUUID();
    const query = `
      INSERT INTO webhooks (id, name, url, events, headers, secret, is_active, retry_count, timeout, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8, NOW(), NOW())
      RETURNING *
    `;

    const values = [
      id,
      request.name,
      request.url,
      JSON.stringify(request.events),
      JSON.stringify(request.headers || {}),
      request.secret,
      request.retryCount || 3,
      request.timeout || 10000,
    ];

    const result = await this.pool.query(query, values);
    return this.mapWebhookRow(result.rows[0]);
  }

  /**
   * Get webhook by ID
   */
  async getWebhook(id: string): Promise<WebhookConfig | null> {
    const query = 'SELECT * FROM webhooks WHERE id = $1';
    const result = await this.pool.query(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapWebhookRow(result.rows[0]);
  }

  /**
   * List all webhooks
   */
  async listWebhooks(): Promise<WebhookConfig[]> {
    const query = 'SELECT * FROM webhooks ORDER BY created_at DESC';
    const result = await this.pool.query(query);

    return result.rows.map(row => this.mapWebhookRow(row));
  }

  /**
   * Update webhook configuration
   */
  async updateWebhook(
    id: string,
    updates: Partial<CreateWebhookRequest>
  ): Promise<WebhookConfig | null> {
    const webhook = await this.getWebhook(id);
    if (!webhook) {
      return null;
    }

    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }

    if (updates.url !== undefined) {
      fields.push(`url = $${paramIndex++}`);
      values.push(updates.url);
    }

    if (updates.events !== undefined) {
      const invalidEvents = updates.events.filter(event => !this.supportedEvents.includes(event));
      if (invalidEvents.length > 0) {
        throw new Error(`Unsupported events: ${invalidEvents.join(', ')}`);
      }
      fields.push(`events = $${paramIndex++}`);
      values.push(JSON.stringify(updates.events));
    }

    if (updates.headers !== undefined) {
      fields.push(`headers = $${paramIndex++}`);
      values.push(JSON.stringify(updates.headers));
    }

    if (updates.secret !== undefined) {
      fields.push(`secret = $${paramIndex++}`);
      values.push(updates.secret);
    }

    if (updates.retryCount !== undefined) {
      fields.push(`retry_count = $${paramIndex++}`);
      values.push(updates.retryCount);
    }

    if (updates.timeout !== undefined) {
      fields.push(`timeout = $${paramIndex++}`);
      values.push(updates.timeout);
    }

    if (fields.length === 0) {
      return webhook;
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const query = `
      UPDATE webhooks 
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await this.pool.query(query, values);
    return this.mapWebhookRow(result.rows[0]);
  }

  /**
   * Delete webhook
   */
  async deleteWebhook(id: string): Promise<boolean> {
    const query = 'DELETE FROM webhooks WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return (result.rowCount || 0) > 0;
  }

  /**
   * Toggle webhook active status
   */
  async toggleWebhook(id: string, isActive: boolean): Promise<WebhookConfig | null> {
    const query = `
      UPDATE webhooks 
      SET is_active = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;

    const result = await this.pool.query(query, [isActive, id]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapWebhookRow(result.rows[0]);
  }

  /**
   * Trigger webhook for an event
   */
  async triggerEvent(event: string, data: any, source: string = 'seraphc2'): Promise<void> {
    if (!this.supportedEvents.includes(event)) {
      throw new Error(`Unsupported event: ${event}`);
    }

    // Create event record
    const eventId = randomUUID();
    const eventQuery = `
      INSERT INTO webhook_events (id, event, data, timestamp, source)
      VALUES ($1, $2, $3, NOW(), $4)
    `;

    await this.pool.query(eventQuery, [eventId, event, JSON.stringify(data), source]);

    // Find webhooks that listen to this event
    const webhooksQuery = `
      SELECT * FROM webhooks 
      WHERE is_active = true 
      AND events::jsonb ? $1
    `;

    const webhooksResult = await this.pool.query(webhooksQuery, [event]);
    const webhooks = webhooksResult.rows.map(row => this.mapWebhookRow(row));

    // Trigger each webhook
    for (const webhook of webhooks) {
      await this.deliverWebhook(webhook, {
        id: eventId,
        event,
        data,
        timestamp: new Date(),
        source,
      });
    }
  }

  /**
   * Deliver webhook to endpoint
   */
  private async deliverWebhook(webhook: WebhookConfig, eventData: WebhookEvent): Promise<void> {
    const deliveryId = randomUUID();

    try {
      // Create delivery record
      const deliveryQuery = `
        INSERT INTO webhook_deliveries (id, webhook_id, event_id, url, attempts, created_at)
        VALUES ($1, $2, $3, $4, 0, NOW())
      `;

      await this.pool.query(deliveryQuery, [deliveryId, webhook.id, eventData.id, webhook.url]);

      // Prepare webhook payload
      const payload = {
        id: eventData.id,
        event: eventData.event,
        timestamp: eventData.timestamp.toISOString(),
        data: eventData.data,
        source: eventData.source,
      };

      // Prepare headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'SeraphC2-Webhook/1.0',
        ...webhook.headers,
      };

      // Add signature if secret is provided
      if (webhook.secret) {
        const signature = this.generateSignature(JSON.stringify(payload), webhook.secret);
        headers['X-SeraphC2-Signature'] = signature;
      }

      // Make HTTP request
      const config: AxiosRequestConfig = {
        method: 'POST',
        url: webhook.url,
        data: payload,
        headers,
        timeout: webhook.timeout,
        validateStatus: status => status >= 200 && status < 300,
      };

      const response = await axios(config);

      // Update delivery record with success
      const updateQuery = `
        UPDATE webhook_deliveries 
        SET http_status = $1, response_body = $2, delivered_at = NOW(), attempts = attempts + 1
        WHERE id = $3
      `;

      await this.pool.query(updateQuery, [
        response.status,
        response.data ? JSON.stringify(response.data) : null,
        deliveryId,
      ]);
    } catch (error: any) {
      // Update delivery record with error
      const updateQuery = `
        UPDATE webhook_deliveries 
        SET http_status = $1, error_message = $2, attempts = attempts + 1, next_retry_at = $3
        WHERE id = $4
      `;

      const httpStatus = error.response?.status || null;
      const errorMessage = error.message || 'Unknown error';
      const nextRetryAt = this.calculateNextRetry(1, webhook.retryCount);

      await this.pool.query(updateQuery, [httpStatus, errorMessage, nextRetryAt, deliveryId]);

      // Schedule retry if within retry limit
      if (1 < webhook.retryCount) {
        setTimeout(() => {
          this.retryDelivery(deliveryId, webhook, eventData);
        }, this.getRetryDelay(1));
      }
    }
  }

  /**
   * Retry failed webhook delivery
   */
  private async retryDelivery(
    deliveryId: string,
    webhook: WebhookConfig,
    eventData: WebhookEvent
  ): Promise<void> {
    const deliveryQuery = 'SELECT * FROM webhook_deliveries WHERE id = $1';
    const deliveryResult = await this.pool.query(deliveryQuery, [deliveryId]);

    if (deliveryResult.rows.length === 0) {
      return;
    }

    const delivery = deliveryResult.rows[0];

    if (delivery.attempts >= webhook.retryCount) {
      return; // Max retries reached
    }

    try {
      // Prepare webhook payload
      const payload = {
        id: eventData.id,
        event: eventData.event,
        timestamp: eventData.timestamp.toISOString(),
        data: eventData.data,
        source: eventData.source,
      };

      // Prepare headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'SeraphC2-Webhook/1.0',
        ...webhook.headers,
      };

      // Add signature if secret is provided
      if (webhook.secret) {
        const signature = this.generateSignature(JSON.stringify(payload), webhook.secret);
        headers['X-SeraphC2-Signature'] = signature;
      }

      // Make HTTP request
      const config: AxiosRequestConfig = {
        method: 'POST',
        url: webhook.url,
        data: payload,
        headers,
        timeout: webhook.timeout,
        validateStatus: status => status >= 200 && status < 300,
      };

      const response = await axios(config);

      // Update delivery record with success
      const updateQuery = `
        UPDATE webhook_deliveries 
        SET http_status = $1, response_body = $2, delivered_at = NOW(), attempts = attempts + 1, next_retry_at = NULL
        WHERE id = $3
      `;

      await this.pool.query(updateQuery, [
        response.status,
        response.data ? JSON.stringify(response.data) : null,
        deliveryId,
      ]);
    } catch (error: any) {
      const newAttempts = delivery.attempts + 1;

      // Update delivery record with error
      const updateQuery = `
        UPDATE webhook_deliveries 
        SET http_status = $1, error_message = $2, attempts = $3, next_retry_at = $4
        WHERE id = $5
      `;

      const httpStatus = error.response?.status || null;
      const errorMessage = error.message || 'Unknown error';
      const nextRetryAt = this.calculateNextRetry(newAttempts, webhook.retryCount);

      await this.pool.query(updateQuery, [
        httpStatus,
        errorMessage,
        newAttempts,
        nextRetryAt,
        deliveryId,
      ]);

      // Schedule next retry if within retry limit
      if (newAttempts < webhook.retryCount) {
        setTimeout(() => {
          this.retryDelivery(deliveryId, webhook, eventData);
        }, this.getRetryDelay(newAttempts));
      }
    }
  }

  /**
   * Get webhook deliveries
   */
  async getWebhookDeliveries(webhookId: string, limit: number = 50): Promise<WebhookDelivery[]> {
    const query = `
      SELECT * FROM webhook_deliveries 
      WHERE webhook_id = $1 
      ORDER BY created_at DESC 
      LIMIT $2
    `;

    const result = await this.pool.query(query, [webhookId, limit]);
    return result.rows.map(row => this.mapDeliveryRow(row));
  }

  /**
   * Get supported events
   */
  getSupportedEvents(): string[] {
    return [...this.supportedEvents];
  }

  /**
   * Generate HMAC signature for webhook payload
   */
  private generateSignature(payload: string, secret: string): string {
    const hmac = createHmac('sha256', secret);
    hmac.update(payload);
    return `sha256=${hmac.digest('hex')}`;
  }

  /**
   * Calculate next retry time
   */
  private calculateNextRetry(attempts: number, maxRetries: number): Date | null {
    if (attempts >= maxRetries) {
      return null;
    }

    const delay = this.getRetryDelay(attempts);
    return new Date(Date.now() + delay);
  }

  /**
   * Get retry delay with exponential backoff
   */
  private getRetryDelay(attempts: number): number {
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s
    return Math.min(1000 * Math.pow(2, attempts - 1), 30000);
  }

  /**
   * Map database row to WebhookConfig
   */
  private mapWebhookRow(row: any): WebhookConfig {
    return {
      id: row.id,
      name: row.name,
      url: row.url,
      events: JSON.parse(row.events),
      headers: JSON.parse(row.headers),
      secret: row.secret,
      isActive: row.is_active,
      retryCount: row.retry_count,
      timeout: row.timeout,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Map database row to WebhookDelivery
   */
  private mapDeliveryRow(row: any): WebhookDelivery {
    return {
      id: row.id,
      webhookId: row.webhook_id,
      eventId: row.event_id,
      url: row.url,
      httpStatus: row.http_status,
      responseBody: row.response_body,
      errorMessage: row.error_message,
      deliveredAt: row.delivered_at,
      attempts: row.attempts,
      nextRetryAt: row.next_retry_at,
      createdAt: row.created_at,
    };
  }
}
