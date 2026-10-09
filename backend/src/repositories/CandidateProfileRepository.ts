/** Candidate Profile repository for database operations. */

import { Types } from 'mongoose';
import { CandidateProfileModel, ICandidateProfile, IJobPreferences } from '../models/CandidateProfile.js';
import { NotFoundError } from '../utils/errors.js';

export interface CreateProfileData {
  userId: Types.ObjectId;
  firstName: string;
  lastName: string;
  // Other fields optional
  [key: string]: unknown;
}

export interface UpdateProfileData {
  // All fields optional for partial updates
  [key: string]: unknown;
}

type LeanProfile = ICandidateProfile & { _id: Types.ObjectId };

export class CandidateProfileRepository {
  /**
   * Find profile by user ID
   */
  async findByUserId(userId: Types.ObjectId | string): Promise<ICandidateProfile | null> {
    return CandidateProfileModel.findOne({ userId }).lean<LeanProfile>().exec();
  }

  /**
   * Find profile by user ID or throw
   */
  async findByUserIdOrThrow(userId: Types.ObjectId | string): Promise<ICandidateProfile> {
    const profile = await this.findByUserId(userId);
    if (!profile) {
      throw new NotFoundError('Profile', userId.toString());
    }
    return profile;
  }

  /**
   * Create a new profile
   */
  async create(data: CreateProfileData): Promise<ICandidateProfile> {
    const profile = new CandidateProfileModel(data);
    return profile.save();
  }

  /**
   * Update profile by user ID
   */
  async updateByUserId(userId: Types.ObjectId | string, data: UpdateProfileData): Promise<ICandidateProfile | null> {
    // Remove fields that should not be updated directly
    const { userId: _userId, createdAt, updatedAt, _id, ...updateData } = data;
    return CandidateProfileModel.findOneAndUpdate(
      { userId },
      { $set: updateData },
      { new: true, runValidators: true }
    ).lean<LeanProfile>().exec();
  }

  /**
   * Delete profile by user ID
   */
  async deleteByUserId(userId: Types.ObjectId | string): Promise<boolean> {
    const result = await CandidateProfileModel.deleteOne({ userId }).exec();
    return result.deletedCount > 0;
  }

  /**
   * Update job preferences
   */
  async updatePreferences(userId: Types.ObjectId | string, preferences: Partial<IJobPreferences>): Promise<ICandidateProfile | null> {
    return CandidateProfileModel.findOneAndUpdate(
      { userId },
      { $set: { jobPreferences: preferences } },
      { new: true, runValidators: true }
    ).lean<LeanProfile>().exec();
  }

  /**
   * Add a skill
   */
  async addSkill(userId: Types.ObjectId | string, skill: { name: string; level?: string; years?: number; category?: string }): Promise<ICandidateProfile | null> {
    return CandidateProfileModel.findOneAndUpdate(
      { userId },
      { $push: { skills: skill } },
      { new: true, runValidators: true }
    ).lean<LeanProfile>().exec();
  }

  /**
   * Remove a skill by skill ID
   */
  async removeSkill(userId: Types.ObjectId | string, skillId: Types.ObjectId | string): Promise<ICandidateProfile | null> {
    return CandidateProfileModel.findOneAndUpdate(
      { userId },
      { $pull: { skills: { _id: skillId } } },
      { new: true }
    ).lean<LeanProfile>().exec();
  }

  /**
   * Add experience
   */
  async addExperience(userId: Types.ObjectId | string, experience: Record<string, unknown>): Promise<ICandidateProfile | null> {
    return CandidateProfileModel.findOneAndUpdate(
      { userId },
      { $push: { experience } },
      { new: true, runValidators: true }
    ).lean<LeanProfile>().exec();
  }

  /**
   * Remove experience by ID
   */
  async removeExperience(userId: Types.ObjectId | string, experienceId: Types.ObjectId | string): Promise<ICandidateProfile | null> {
    return CandidateProfileModel.findOneAndUpdate(
      { userId },
      { $pull: { experience: { _id: experienceId } } },
      { new: true }
    ).lean<LeanProfile>().exec();
  }

  /**
   * Add education
   */
  async addEducation(userId: Types.ObjectId | string, education: Record<string, unknown>): Promise<ICandidateProfile | null> {
    return CandidateProfileModel.findOneAndUpdate(
      { userId },
      { $push: { education } },
      { new: true, runValidators: true }
    ).lean<LeanProfile>().exec();
  }

  /**
   * Remove education by ID
   */
  async removeEducation(userId: Types.ObjectId | string, educationId: Types.ObjectId | string): Promise<ICandidateProfile | null> {
    return CandidateProfileModel.findOneAndUpdate(
      { userId },
      { $pull: { education: { _id: educationId } } },
      { new: true }
    ).lean<LeanProfile>().exec();
  }

  /**
   * Add project
   */
  async addProject(userId: Types.ObjectId | string, project: Record<string, unknown>): Promise<ICandidateProfile | null> {
    return CandidateProfileModel.findOneAndUpdate(
      { userId },
      { $push: { projects: project } },
      { new: true, runValidators: true }
    ).lean<LeanProfile>().exec();
  }

  /**
   * Remove project by ID
   */
  async removeProject(userId: Types.ObjectId | string, projectId: Types.ObjectId | string): Promise<ICandidateProfile | null> {
    return CandidateProfileModel.findOneAndUpdate(
      { userId },
      { $pull: { projects: { _id: projectId } } },
      { new: true }
    ).lean<LeanProfile>().exec();
  }

  /**
   * Add certification
   */
  async addCertification(userId: Types.ObjectId | string, certification: Record<string, unknown>): Promise<ICandidateProfile | null> {
    return CandidateProfileModel.findOneAndUpdate(
      { userId },
      { $push: { certifications: certification } },
      { new: true, runValidators: true }
    ).lean<LeanProfile>().exec();
  }

  /**
   * Remove certification by ID
   */
  async removeCertification(userId: Types.ObjectId | string, certificationId: Types.ObjectId | string): Promise<ICandidateProfile | null> {
    return CandidateProfileModel.findOneAndUpdate(
      { userId },
      { $pull: { certifications: { _id: certificationId } } },
      { new: true }
    ).lean<LeanProfile>().exec();
  }

  /**
   * Check if profile exists for user
   */
  async exists(userId: Types.ObjectId | string): Promise<boolean> {
    const count = await CandidateProfileModel.countDocuments({ userId }).exec();
    return count > 0;
  }

  /**
   * Convert to public profile (exclude sensitive fields if needed)
   */
  toPublic(profile: ICandidateProfile): ICandidateProfile {
    // Return the profile as-is; sensitive fields are handled at the service level
    return profile;
  }
}