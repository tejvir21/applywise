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

  // File storage
  STORAGE_PROVIDER: z.enum(["local", "s3", "cloudinary"]).default("local"),
  LOCAL_STORAGE_PATH: z.string().default("./storage/uploads"),

  // Browser automation
  BROWSER_AUTOMATION_PROVIDER: z.enum(["mock", "playwright"]).default("mock"),

  // Resume
  MAX_RESUME_SIZE_MB: z.coerce.number().default(10),
  RESUME_STORAGE_PATH: z.string().default("./storage/uploads"),
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
