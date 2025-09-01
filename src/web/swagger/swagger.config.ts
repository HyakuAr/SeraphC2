/**
 * OpenAPI/Swagger configuration for SeraphC2 API documentation
 */

import swaggerJsdoc from 'swagger-jsdoc';
import type { SwaggerDefinition } from 'swagger-jsdoc';

const swaggerDefinition: SwaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'SeraphC2 API',
    version: '1.0.0',
    description: 'Comprehensive REST API for SeraphC2 Command and Control Framework',
    contact: {
      name: 'SeraphC2 Team',
      email: 'support@seraphc2.com',
    },
    license: {
      name: 'MIT',
      url: 'https://opensource.org/licenses/MIT',
    },
  },
  servers: [
    {
      url: '/api',
      description: 'SeraphC2 API Server',
    },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT token obtained from /auth/login endpoint',
      },
      ApiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
        description: 'API key for external integrations',
      },
      BasicAuth: {
        type: 'http',
        scheme: 'basic',
        description: 'Basic authentication with username and password',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: false,
          },
          error: {
            type: 'string',
            description: 'Error message',
          },
          code: {
            type: 'string',
            description: 'Error code for programmatic handling',
          },
          details: {
            type: 'object',
            description: 'Additional error details',
          },
        },
        required: ['success', 'error'],
      },
      Success: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: true,
          },
          message: {
            type: 'string',
            description: 'Success message',
          },
          data: {
            type: 'object',
            description: 'Response data',
          },
        },
        required: ['success'],
      },
      Implant: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            format: 'uuid',
            description: 'Unique implant identifier',
          },
          hostname: {
            type: 'string',
            description: 'Target system hostname',
          },
          username: {
            type: 'string',
            description: 'Current user context',
          },
          operatingSystem: {
            type: 'string',
            description: 'Operating system information',
          },
          architecture: {
            type: 'string',
            enum: ['x86', 'x64', 'arm64'],
            description: 'System architecture',
          },
          privileges: {
            type: 'string',
            enum: ['user', 'admin', 'system'],
            description: 'Current privilege level',
          },
          lastSeen: {
            type: 'string',
            format: 'date-time',
            description: 'Last communication timestamp',
          },
          status: {
            type: 'string',
            enum: ['active', 'inactive', 'error'],
            description: 'Current implant status',
          },
          communicationProtocol: {
            type: 'string',
            enum: ['http', 'https', 'dns', 'smb', 'websocket'],
            description: 'Active communication protocol',
          },
        },
        required: ['id', 'hostname', 'username', 'operatingSystem', 'status'],
      },
      Command: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            format: 'uuid',
            description: 'Unique command identifier',
          },
          implantId: {
            type: 'string',
            format: 'uuid',
            description: 'Target implant identifier',
          },
          operatorId: {
            type: 'string',
            format: 'uuid',
            description: 'Operator who issued the command',
          },
          type: {
            type: 'string',
            enum: ['shell', 'powershell', 'file', 'system', 'module'],
            description: 'Command type',
          },
          payload: {
            type: 'string',
            description: 'Command payload or parameters',
          },
          timestamp: {
            type: 'string',
            format: 'date-time',
            description: 'Command execution timestamp',
          },
          status: {
            type: 'string',
            enum: ['pending', 'executing', 'completed', 'failed', 'timeout'],
            description: 'Command execution status',
          },
          result: {
            type: 'object',
            properties: {
              output: {
                type: 'string',
                description: 'Command output',
              },
              error: {
                type: 'string',
                description: 'Error output if any',
              },
              exitCode: {
                type: 'integer',
                description: 'Command exit code',
              },
            },
          },
          executionTime: {
            type: 'integer',
            description: 'Execution time in milliseconds',
          },
        },
        required: ['id', 'implantId', 'operatorId', 'type', 'payload', 'timestamp', 'status'],
      },
      Operator: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            format: 'uuid',
            description: 'Unique operator identifier',
          },
          username: {
            type: 'string',
            description: 'Operator username',
          },
          email: {
            type: 'string',
            format: 'email',
            description: 'Operator email address',
          },
          role: {
            type: 'string',
            enum: ['read-only', 'operator', 'administrator'],
            description: 'Operator role and permissions',
          },
          lastLogin: {
            type: 'string',
            format: 'date-time',
            description: 'Last login timestamp',
          },
          isActive: {
            type: 'boolean',
            description: 'Whether operator is currently active',
          },
        },
        required: ['id', 'username', 'email', 'role', 'isActive'],
      },
      WebhookConfig: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            format: 'uuid',
            description: 'Unique webhook identifier',
          },
          name: {
            type: 'string',
            description: 'Webhook name',
          },
          url: {
            type: 'string',
            format: 'uri',
            description: 'Webhook endpoint URL',
          },
          events: {
            type: 'array',
            items: {
              type: 'string',
              enum: [
                'implant.connected',
                'implant.disconnected',
                'command.executed',
                'file.uploaded',
                'file.downloaded',
                'operator.login',
                'operator.logout',
                'alert.triggered',
              ],
            },
            description: 'Events that trigger this webhook',
          },
          headers: {
            type: 'object',
            additionalProperties: {
              type: 'string',
            },
            description: 'Custom headers to send with webhook requests',
          },
          secret: {
            type: 'string',
            description: 'Secret for webhook signature verification',
          },
          isActive: {
            type: 'boolean',
            description: 'Whether webhook is active',
          },
          retryCount: {
            type: 'integer',
            minimum: 0,
            maximum: 5,
            description: 'Number of retry attempts for failed webhooks',
          },
          timeout: {
            type: 'integer',
            minimum: 1000,
            maximum: 30000,
            description: 'Webhook timeout in milliseconds',
          },
        },
        required: ['id', 'name', 'url', 'events', 'isActive'],
      },
    },
  },
  security: [
    {
      BearerAuth: [],
    },
  ],
};

const options = {
  definition: swaggerDefinition,
  apis: ['./src/web/routes/*.ts', './src/web/routes/**/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);

export const swaggerOptions = {
  explorer: true,
  customCss: `
    .swagger-ui .topbar { display: none; }
    .swagger-ui .info .title { color: #1976d2; }
    .swagger-ui .scheme-container { background: #fafafa; }
  `,
  customSiteTitle: 'SeraphC2 API Documentation',
  customfavIcon: '/favicon.ico',
};
