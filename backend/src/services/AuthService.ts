/** Authentication service: registration, login, token management. */

import { UserRepository, UserPublic } from '../repositories/UserRepository.js';
import { hashPassword, verifyPassword, createAccessToken, createRefreshToken, decodeRefreshToken, TokenPayload } from '../utils/auth.js';
import { ConflictError, UnauthorizedError } from '../utils/errors.js';

const userRepo = new UserRepository();

export interface RegisterResult {
  user: UserPublic;
  accessToken: string;
  refreshToken: string;
}

export type LoginResult = RegisterResult;

export async function registerUser(email: string, password: string): Promise<RegisterResult> {
  if (await userRepo.emailExists(email)) {
    throw new ConflictError('Email already registered', { email });
  }

  const passwordHash = await hashPassword(password);
  const user = await userRepo.create({ email, passwordHash });
  const publicUser = userRepo.toPublic(user);

  const accessToken = createAccessToken(publicUser.id, publicUser.email);
  const refreshToken = createRefreshToken(publicUser.id, publicUser.email);

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

  return { user: publicUser, accessToken, refreshToken };
}

export async function refreshTokens(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
  const payload = decodeRefreshToken(refreshToken);
  const user = await userRepo.findByIdOrThrow(payload.sub);

  if (!user.isActive) {
    throw new UnauthorizedError('User not found or inactive');
  }

  const publicUser = userRepo.toPublic(user);
  const newAccessToken = createAccessToken(publicUser.id, publicUser.email);
  const newRefreshToken = createRefreshToken(publicUser.id, publicUser.email);

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}

export async function getCurrentUser(payload: TokenPayload): Promise<UserPublic> {
  const user = await userRepo.findByIdOrThrow(payload.sub);
  if (!user.isActive) throw new UnauthorizedError('User not found or inactive');
  return userRepo.toPublic(user);
}