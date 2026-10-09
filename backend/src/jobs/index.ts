/** Jobs package initialization. */

export {
  //   JobSourceAdapter,
  JobSourceRegistry,
  jobSourceRegistry,
  //   NormalizedJob,
  //   JobSearchCriteria,
  //   JobSearchResult,
} from "./JobSourceAdapter.js";
export { ManualJobSource, manualJobSource } from "./ManualJobSource.js";
export { MockJobSource, mockJobSource } from "./MockJobSource.js";

import { jobSourceRegistry } from "./JobSourceAdapter.js";
import { manualJobSource } from "./ManualJobSource.js";
import { mockJobSource } from "./MockJobSource.js";

// Register the built-in adapters so services resolving sources through the
// registry (e.g. POST /api/jobs/import/source) find them. Only sources with
// verified, authorized access are registered; no external platform adapters
// exist yet (see ARCHITECTURE.md).
jobSourceRegistry.register(manualJobSource);
jobSourceRegistry.register(mockJobSource);
