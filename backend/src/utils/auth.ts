/** JWT token utilities and password hashing. */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { getConfig } from '../config/index.js';
import { UnauthorizedError } from './errors.js';

const config = getConfig();

const ACCESS_TOKEN_TTL = config.JWT_ACCESS_TTL_MINUTES * 60; // seconds
const REFRESH_TOKEN_TTL = config.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60; // seconds

export interface TokenPayload {
  sub: string; // user ID
  email: string;
  type: 'access' | 'refresh';
  iat?: number;
  exp?: number;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function createAccessToken(userId: string, email: string): string {
  const payload: Omit<TokenPayload, 'iat' | 'exp'> = { sub: userId, email, type: 'access' };
  return jwt.sign(payload, config.JWT_ACCESS_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
}

export function createRefreshToken(userId: string, email: string): string {
  const payload: Omit<TokenPayload, 'iat' | 'exp'> & { jti: string } = {
    sub: userId,
    email,
    type: 'refresh',
    jti: randomUUID(),
  };
  return jwt.sign(payload, config.JWT_REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_TTL });
}

export function decodeAccessToken(token: string): TokenPayload {
  return decodeToken(token, config.JWT_ACCESS_SECRET, 'access');
}

export function decodeRefreshToken(token: string): TokenPayload {
  return decodeToken(token, config.JWT_REFRESH_SECRET, 'refresh');
}

function decodeToken(token: string, secret: string, expectedType: 'access' | 'refresh'): TokenPayload {
  try {
    const payload = jwt.verify(token, secret) as TokenPayload;
    if (payload.type !== expectedType) {
      throw new UnauthorizedError('Invalid token type');
    }
    return payload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Token has expired');
    }
    if (err instanceof jwt.JsonWebTokenError) {
      throw new UnauthorizedError('Invalid token');
    }
    throw err;
  }
}