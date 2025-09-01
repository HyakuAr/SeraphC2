/**
 * Express.js type extensions for SeraphC2
 */

import { Operator } from './entities';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        username: string;
        role: string;
        permissions?: string[];
      };
      operator?: Operator;
      operatorId?: string;
    }
  }
}

export {};
