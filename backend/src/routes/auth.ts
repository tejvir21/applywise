/** Authentication routes. */

import { Router, Response } from 'express';
import { registerSchema, loginSchema, refreshSchema } from '../schemas/auth.js';
import { registerUser, loginUser, refreshTokens, getCurrentUser } from '../services/AuthService.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { rateLimitRegister, rateLimitLogin, rateLimitRefresh } from '../middleware/rateLimiter.js';
import { validate } from '../middleware/validate.js';

const router = Router();

/**
 * POST /api/auth/register
 * Register a new user
 */
router.post(
  '/register',
  rateLimitRegister,
  validate(registerSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const { email, password } = req.body;
    const result = await registerUser(email, password);

    res.status(201).json({
      success: true,
      data: {
        access_token: result.accessToken,
        refresh_token: result.refreshToken,
        token_type: 'bearer',
        expires_in: 900, // 15 minutes
      },
    });
  }
);

/**
 * POST /api/auth/login
 * Authenticate user and return tokens
 */
router.post(
  '/login',
  rateLimitLogin,
  validate(loginSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const { email, password } = req.body;
    const result = await loginUser(email, password);

    res.json({
      success: true,
      data: {
        access_token: result.accessToken,
        refresh_token: result.refreshToken,
        token_type: 'bearer',
        expires_in: 900,
      },
    });
  }
);

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
router.post(
  '/refresh',
  rateLimitRefresh,
  validate(refreshSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const { refresh_token } = req.body;
    const result = await refreshTokens(refresh_token);

    res.json({
      success: true,
      data: {
        access_token: result.accessToken,
        refresh_token: result.refreshToken,
        token_type: 'bearer',
        expires_in: 900,
      },
    });
  }
);

/**
 * POST /api/auth/logout
 * Logout - client should discard tokens
 */
router.post('/logout', async (_req: AuthenticatedRequest, res: Response) => {
  res.json({
    success: true,
    data: { message: 'Logged out successfully' },
  });
});

/**
 * GET /api/auth/me
 * Get current authenticated user
 */
router.get(
  '/me',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    const user = await getCurrentUser(req.user!);

    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        created_at: user.createdAt.toISOString(),
        is_active: user.isActive,
      },
    });
  }
);

export default router;