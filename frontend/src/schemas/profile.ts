import { z } from 'zod'

const skillSchema = z.object({
  _id: z.string().optional(),
  name: z.string(),
  level: z.string().optional(),
  years: z.number().optional(),
  category: z.string().optional(),
})

export const profileSchema = z.object({
  _id: z.string().optional(),
  userId: z.string().optional(),
  firstName: z.string(),
  lastName: z.string(),
  displayName: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  location: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  postalCode: z.string().optional(),
  headline: z.string().optional(),
  professionalSummary: z.string().optional(),
  yearsOfExperience: z.number().optional(),
  currentJobTitle: z.string().optional(),
  currentCompany: z.string().optional(),
  skills: z.array(skillSchema).optional().default([]),
  socialLinks: z
    .object({
      github: z.string().optional(),
      linkedin: z.string().optional(),
      portfolio: z.string().optional(),
      website: z.string().optional(),
      other: z.array(z.string()).optional(),
    })
    .optional(),
  experience: z.array(z.unknown()).optional().default([]),
  education: z.array(z.unknown()).optional().default([]),
  certifications: z.array(z.unknown()).optional().default([]),
  projects: z.array(z.unknown()).optional().default([]),
})

export const preferencesSchema = z.object({
  desiredRoles: z.array(z.string()).optional().default([]),
  preferredLocations: z.array(z.string()).optional().default([]),
  preferredCountries: z.array(z.string()).optional().default([]),
  workMode: z.array(z.string()).optional().default([]),
  employmentTypes: z.array(z.string()).optional().default([]),
  experienceLevels: z.array(z.string()).optional().default([]),
  salaryMin: z.number().optional(),
  salaryMax: z.number().optional(),
  salaryCurrency: z.string().optional(),
  salaryPeriod: z.string().optional(),
  industries: z.array(z.string()).optional().default([]),
  requiredSkills: z.array(z.string()).optional().default([]),
  preferredSkills: z.array(z.string()).optional().default([]),
  excludedCompanies: z.array(z.string()).optional().default([]),
  excludedJobTypes: z.array(z.string()).optional().default([]),
})
