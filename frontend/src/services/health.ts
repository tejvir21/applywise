import { healthDataSchema } from "@/schemas/health";
import { apiGet } from "@/services/api";
import type { HealthData } from "@/types/api";

export async function getHealth(): Promise<HealthData> {
  const data = await apiGet<HealthData>("/api/health");
  return healthDataSchema.parse(data);
}
