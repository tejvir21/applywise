/** Authentication service: registration, login, token management. */

import { UserRepository, UserPublic } from '../repositories/UserRepository.js';
import { hashPassword, verifyPassword, createAccessToken, createRefreshToken, decodeRefreshToken, TokenPayload } from '../utils/auth.js';
import { getConfig } from '../config/index.js';
import { RefreshSessionModel } from '../models/RefreshSession.js';
import { ConflictError, UnauthorizedError } from '../utils/errors.js';

const userRepo = new UserRepository();

export interface RegisterResult {
  user: UserPublic;
  accessToken: string;
  refreshToken: string;
}

export type LoginResult = RegisterResult;

function refreshExpiry(): Date {
  return new Date(Date.now() + getConfig().JWT_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
}

function tokenJti(refreshToken: string): string {
  const payload = decodeRefreshToken(refreshToken) as TokenPayload & { jti?: string };
  if (!payload.jti) {
    throw new UnauthorizedError('Invalid token');
  }
  return payload.jti;
}

async function storeRefreshSession(userId: string, refreshToken: string): Promise<void> {
  await RefreshSessionModel.updateOne(
    { jti: tokenJti(refreshToken) },
    { $set: { userId, expiresAt: refreshExpiry() } },
    { upsert: true },
  ).exec();
}

export async function registerUser(email: string, password: string): Promise<RegisterResult> {
  if (await userRepo.emailExists(email)) {
    throw new ConflictError('Email already registered', { email });
  }

  const passwordHash = await hashPassword(password);
  const user = await userRepo.create({ email, passwordHash });
  const publicUser = userRepo.toPublic(user);

  const accessToken = createAccessToken(publicUser.id, publicUser.email);
  const refreshToken = createRefreshToken(publicUser.id, publicUser.email);
  await storeRefreshSession(publicUser.id, refreshToken);

  return { user: publicUser, accessToken, refreshToken };
}

export async function loginUser(email: string, password: string): Promise<LoginResult> {
  const user = await userRepo.findByEmail(email);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new UnauthorizedError('Invalid email or password');
  }

  if (!user.isActive) {
    throw new UnauthorizedError('Account is disabled');
  }

  await userRepo.updateLastLogin(user._id.toString());
  const publicUser = userRepo.toPublic(user);

  const accessToken = createAccessToken(publicUser.id, publicUser.email);
  const refreshToken = createRefreshToken(publicUser.id, publicUser.email);
  await storeRefreshSession(publicUser.id, refreshToken);

  return { user: publicUser, accessToken, refreshToken };
}

export async function refreshTokens(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
  const payload = decodeRefreshToken(refreshToken);
  const user = await userRepo.findByIdOrThrow(payload.sub);

  if (!user.isActive) {
    throw new UnauthorizedError('User not found or inactive');
  }

  // Rotation with reuse detection: the presented token must be a live session.
  // Replays of rotated or logged-out tokens fail closed here.
  const jti = tokenJti(refreshToken);
  const session = await RefreshSessionModel.findOneAndDelete({ jti, userId: payload.sub }).exec();
  if (!session) {
    throw new UnauthorizedError('Session expired or revoked');
  }

  const publicUser = userRepo.toPublic(user);
  const newAccessToken = createAccessToken(publicUser.id, publicUser.email);
  const newRefreshToken = createRefreshToken(publicUser.id, publicUser.email);
  await storeRefreshSession(publicUser.id, newRefreshToken);

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}

/**
 * End a refresh-token session. Idempotent: unknown, expired, or missing
 * tokens still succeed so logout never strands the client.
 */
export async function logoutUser(refreshToken?: string): Promise<void> {
  if (!refreshToken) return;
  try {
    const payload = decodeRefreshToken(refreshToken) as TokenPayload & { jti?: string };
    if (payload.jti) {
      await RefreshSessionModel.deleteOne({ jti: payload.jti }).exec();
    }
  } catch {
    // Expired or malformed tokens have no live session to revoke.
  }
}

export async function getCurrentUser(payload: TokenPayload): Promise<UserPublic> {
  const user = await userRepo.findByIdOrThrow(payload.sub);
  if (!user.isActive) throw new UnauthorizedError('User not found or inactive');
  return userRepo.toPublic(user);
}