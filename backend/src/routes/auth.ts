/** Authentication routes. */

import { Router, Response } from 'express';
import { registerSchema, loginSchema, refreshSchema } from '../schemas/auth.js';
import { registerUser, loginUser, refreshTokens, logoutUser, getCurrentUser } from '../services/AuthService.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { rateLimitRegister, rateLimitLogin, rateLimitRefresh } from '../middleware/rateLimiter.js';
import { validate } from '../middleware/validate.js';
import { getConfig } from '../config/index.js';
import { UnauthorizedError } from '../utils/errors.js';

const router = Router();

const REFRESH_COOKIE_NAME = 'refresh_token';

/**
 * Refresh-token cookie attributes. Same-site deployments (dev on one host)
 * use Lax without Secure; cross-site production (separate frontend/backend
 * origins) requires SameSite=None with Secure. Never a wildcard origin:
 * CORS origins stay explicit (see getCorsOrigins).
 */
function refreshCookieOptions() {
  const config = getConfig();
  const isProd = config.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
    path: '/api/auth',
    maxAge: config.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
  };
}

function setRefreshCookie(res: Response, refreshToken: string): void {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, { ...refreshCookieOptions(), maxAge: undefined });
}

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

    setRefreshCookie(res, result.refreshToken);
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

    setRefreshCookie(res, result.refreshToken);
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
 * Refresh access token using a refresh token. Accepts the token in the
 * request body (legacy/mobile contract) or falls back to the HttpOnly
 * refresh cookie (browser silent-refresh contract).
 */
router.post(
  '/refresh',
  rateLimitRefresh,
  validate(refreshSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const bodyToken = typeof req.body?.refresh_token === 'string' ? req.body.refresh_token : undefined;
    const cookieToken = typeof req.cookies?.[REFRESH_COOKIE_NAME] === 'string' ? req.cookies[REFRESH_COOKIE_NAME] : undefined;
    const refreshToken = bodyToken ?? cookieToken;
    if (!refreshToken) {
      throw new UnauthorizedError('Refresh token required');
    }
    const result = await refreshTokens(refreshToken);

    setRefreshCookie(res, result.refreshToken);
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
 * Logout - clears the refresh cookie; client must also discard tokens.
 */
router.post('/logout', async (req: AuthenticatedRequest, res: Response) => {
  const bodyToken = typeof req.body?.refresh_token === 'string' ? req.body.refresh_token : undefined;
  const cookieToken = typeof req.cookies?.[REFRESH_COOKIE_NAME] === 'string' ? req.cookies[REFRESH_COOKIE_NAME] : undefined;
  await logoutUser(bodyToken ?? cookieToken);
  clearRefreshCookie(res);
  res.json({
    success: true,
    data: { message: 'Logged out successfully' },
  });
});

/**
 * GET /api/auth/session
 * Restore a session from the HttpOnly refresh cookie (set at login/
 * register/refresh). Rotates the refresh token and returns a fresh access
 * token only — the refresh token never appears in the response body.
 * 401 when no valid cookie is present (signed-out state, not an error).
 */
router.get(
  '/session',
  rateLimitRefresh,
  async (req: AuthenticatedRequest, res: Response) => {
    const cookieToken = req.cookies?.[REFRESH_COOKIE_NAME];
    if (typeof cookieToken !== 'string' || !cookieToken) {
      throw new UnauthorizedError('No active session');
    }
    const result = await refreshTokens(cookieToken);

    setRefreshCookie(res, result.refreshToken);
    res.json({
      success: true,
      data: {
        access_token: result.accessToken,
        token_type: 'bearer',
        expires_in: 900,
      },
    });
  }
);

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