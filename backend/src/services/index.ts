/** Services package initialization. */

// Auth service
export {
  registerUser,
  loginUser,
  refreshTokens,
  getCurrentUser,
} from './AuthService.js';

// Auth utils (password hashing, JWT)
export {
  hashPassword,
  verifyPassword,
  createAccessToken,
  createRefreshToken,
  decodeAccessToken,
  decodeRefreshToken,
} from '../utils/auth.js';

// Candidate Profile service
export {
  createProfile,
  getProfile,
  getProfileOrThrow,
  updateProfile,
  deleteProfile,
  getPreferences,
  updatePreferences,
  addSkill,
  removeSkill,
  addExperience,
  removeExperience,
  addEducation,
  removeEducation,
  addProject,
  removeProject,
  addCertification,
  removeCertification,
  getProfileCompletion,
} from './CandidateProfileService.js';

// Resume service
export {
  uploadResume,
  listResumes,
  getResume,
  downloadResume,
  deleteResume,
  setDefaultResume,
  analyzeResume,
  getAnalysis,
  retryAnalysis,
  importToProfile,
} from './ResumeService.js';

// Job service
export {
  searchJobs,
  getJobById,
  createManualJob,
  saveJob,
  unsaveJob,
  importMockJobs,
  importFromSource,
  getSavedJobs,
  getJobWithSaveStatus,
} from './JobService.js';