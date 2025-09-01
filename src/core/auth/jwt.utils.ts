/**
 * JWT token generation and validation utilities for SeraphC2
 * Implements secure token handling with configurable expiration
 */

import jwt from 'jsonwebtoken';
import { OperatorRole } from '../../types/entities';

export interface JwtPayload {
  operatorId: string;
  username: string;
  role: OperatorRole;
  iat?: number;
  exp?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export class JwtUtils {
  private static readonly ACCESS_TOKEN_SECRET =
    process.env['JWT_ACCESS_SECRET'] || 'seraphc2-access-secret-change-in-production';
  private static readonly REFRESH_TOKEN_SECRET =
    process.env['JWT_REFRESH_SECRET'] || 'seraphc2-refresh-secret-change-in-production';
  private static readonly ACCESS_TOKEN_EXPIRY = process.env['JWT_ACCESS_EXPIRY'] || '15m';
  private static readonly REFRESH_TOKEN_EXPIRY = process.env['JWT_REFRESH_EXPIRY'] || '7d';

  /**
   * Generate access and refresh token pair for an operator
   */
  static generateTokenPair(operatorId: string, username: string, role: OperatorRole): TokenPair {
    const payload: JwtPayload = {
      operatorId,
      username,
      role,
    };

    const accessToken = jwt.sign(payload, this.ACCESS_TOKEN_SECRET, {
      expiresIn: this.ACCESS_TOKEN_EXPIRY,
      issuer: 'seraphc2',
      audience: 'seraphc2-operators',
    } as any);

    const refreshToken = jwt.sign({ operatorId }, this.REFRESH_TOKEN_SECRET, {
      expiresIn: this.REFRESH_TOKEN_EXPIRY,
      issuer: 'seraphc2',
      audience: 'seraphc2-operators',
    } as any);

    return { accessToken, refreshToken };
  }

  /**
   * Validate and decode access token
   */
  static validateAccessToken(token: string): JwtPayload | null {
    try {
      const decoded = jwt.verify(token, this.ACCESS_TOKEN_SECRET, {
        issuer: 'seraphc2',
        audience: 'seraphc2-operators',
      }) as JwtPayload;

      return decoded;
    } catch (error) {
      return null;
    }
  }

  /**
   * Validate refresh token and extract operator ID
   */
  static validateRefreshToken(token: string): { operatorId: string } | null {
    try {
      const decoded = jwt.verify(token, this.REFRESH_TOKEN_SECRET, {
        issuer: 'seraphc2',
        audience: 'seraphc2-operators',
      }) as { operatorId: string };

      return decoded;
    } catch (error) {
      return null;
    }
  }

  /**
   * Extract token from Authorization header
   */
  static extractTokenFromHeader(authHeader: string | undefined): string | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    return authHeader.substring(7);
  }

  /**
   * Check if token is expired (without validating signature)
   */
  static isTokenExpired(token: string): boolean {
    try {
      const decoded = jwt.decode(token) as JwtPayload;
      if (!decoded || !decoded.exp) {
        return true;
      }

      return Date.now() >= decoded.exp * 1000;
    } catch (error) {
      return true;
    }
  }
}
