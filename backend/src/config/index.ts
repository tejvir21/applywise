/** Application configuration loaded from environment variables. */

import { z } from "zod";

const envSchema = z.object({
  // Application
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("debug"),
  PORT: z.coerce.number().default(8000),

  // MongoDB
  MONGODB_URI: z.string().default("mongodb://127.0.0.1:27017"),
  MONGODB_DB: z.string().default("ai_job_application_agent"),

  // Auth
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL_MINUTES: z.coerce.number().default(15),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().default(30),

  // Frontend CORS
  CLIENT_URL: z.string().default("http://127.0.0.1:5173"),

  // AI Provider
  AI_PROVIDER: z.enum(["mock", "openai", "ollama"]).default("mock"),
  OPENAI_API_KEY: z.string().optional(),
  OLLAMA_BASE_URL: z.string().url().default("http://127.0.0.1:11434"),
  OLLAMA_MODEL: z.string().default("llama3.1:8b"),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300000).default(30000),

  // File storage. Supabase is the preferred provider in production; local
  // filesystem remains for development/tests and as an explicit persistent
  // fallback (Render disk). Supabase credentials are NOT required when local
  // storage is deliberately selected.
  STORAGE_PROVIDER: z.enum(["local", "supabase"]).default("local"),
  LOCAL_STORAGE_PATH: z.string().default("./storage/uploads"),
  // Explicit opt-in fallback used only when the primary fails at runtime or
  // is misconfigured at startup. "none" disables failover.
  RESUME_STORAGE_FALLBACK: z.enum(["local", "none"]).default("none"),
  // Supabase Storage (preferred). Required only when STORAGE_PROVIDER=supabase.
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_RESUME_BUCKET: z.string().default("resumes"),
  // Bounded resilience for transient Supabase failures.
  SUPABASE_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(8000),
  SUPABASE_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),

  // Browser automation
  BROWSER_AUTOMATION_PROVIDER: z.enum(["mock", "playwright"]).default("mock"),

  // Job discovery (live search over authorized public APIs). No credentials are
  // required for company boards (Greenhouse/Lever/Ashby) or Muse; Adzuna is
  // key-gated and Remotive may be egress-limited. All limits are bounded.
  ADZUNA_APP_ID: z.string().optional(),
  ADZUNA_APP_KEY: z.string().optional(),
  ADZUNA_COUNTRY: z.string().default("in"),
  REMOTIVE_ENABLED: z.enum(["true", "false"]).default("true"),
  COMPANY_BOARDS_JSON: z.string().optional(),
  DISCOVERY_MAX_QUERIES: z.coerce.number().int().min(1).max(20).default(6),
  DISCOVERY_MAX_PAGES_PER_SOURCE: z.coerce.number().int().min(1).max(10).default(2),
  DISCOVERY_MAX_RESULTS_PER_SOURCE: z.coerce.number().int().min(1).max(100).default(50),
  DISCOVERY_PAGE_SIZE: z.coerce.number().int().min(1).max(50).default(20),
  DISCOVERY_RELEVANCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.2),
  DISCOVERY_HTTP_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(6),
  DISCOVERY_HTTP_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(12000),
  DISCOVERY_RESULT_CACHE_MS: z.coerce.number().int().min(0).max(600000).default(120000),
  DISCOVERY_HTTP_CACHE_TTL_MS: z.coerce.number().int().min(0).max(600000).default(60000),

  // Resume
  MAX_RESUME_SIZE_MB: z.coerce.number().default(10),
  RESUME_STORAGE_PATH: z.string().default("./storage/uploads"),

  // Rate limiting (per-user quotas for expensive endpoints)
  RATE_LIMIT_AI_GENERATION_PER_MINUTE: z.coerce.number().int().min(1).max(100).default(10),
  RATE_LIMIT_RESUME_UPLOAD_PER_MINUTE: z.coerce.number().int().min(1).max(100).default(5),
  RATE_LIMIT_RESUME_ANALYSIS_PER_MINUTE: z.coerce.number().int().min(1).max(100).default(5),
  RATE_LIMIT_JOB_INGESTION_PER_MINUTE: z.coerce.number().int().min(1).max(100).default(10),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function getConfig(): Env {
  if (cachedEnv) return cachedEnv;

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const errors = result.error.errors
      .map((e) => `${e.path.join(".")}: ${e.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${errors}`);
  }

  cachedEnv = result.data;
  return cachedEnv;
}

/** Reset config cache for testing. */
export function resetConfigCache(): void {
  cachedEnv = null;
}

export function assertSecretsConfigured(): void {
  const config = getConfig();
  if (config.NODE_ENV === "production") {
    if (config.JWT_ACCESS_SECRET.includes("change-me")) {
      throw new Error(
        "JWT_ACCESS_SECRET must be set to a secure random value in production",
      );
    }
    if (config.JWT_REFRESH_SECRET.includes("change-me")) {
      throw new Error(
        "JWT_REFRESH_SECRET must be set to a secure random value in production",
      );
    }
  }
}

export function getCorsOrigins(): string[] {
  return getConfig()
    .CLIENT_URL.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
