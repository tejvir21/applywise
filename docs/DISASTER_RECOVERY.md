# Disaster Recovery & Backup Procedures

## MongoDB Atlas (Recommended for Production)

### Backup Configuration

1. **Provider:** MongoDB Atlas (managed cloud database)
2. **Backup type:** Continuous cloud backups with point-in-time recovery
3. **Frequency:** Automated snapshots every 6 hours (Atlas default for M10+)
4. **Retention:** 7 days (configurable up to 365 days depending on tier)
5. **RPO (Recovery Point Objective):** ~6 hours (snapshot interval)
6. **RTO (Recovery Time Objective):** ~30 minutes (restore from snapshot)
7. **Encryption:** AES-256 at rest (Atlas managed keys) + TLS in transit
8. **Access permissions:** Database users with specific roles; backup access via Atlas console only

### Manual Backup (Local Development)

For local development or when Atlas backups are unavailable:

```bash
# Create a backup
mongodump --uri="mongodb://127.0.0.1:27017" --db=ai_job_application_agent --out=./backup/$(date +%Y%m%d_%H%M%S)

# Verify backup
ls -la ./backup/
mongorestore --uri="mongodb://127.0.0.1:27017" --db=ai_job_application_agent_test --dryRun ./backup/<timestamp>/ai_job_application_agent
```

**Never commit backup files to the repository.** Add `backup/` to `.gitignore`.

### Restore Procedure

1. **Stop the backend server** to prevent writes during restore.
2. **Create a test database** for verification:
   ```bash
   mongorestore --uri="mongodb://127.0.0.1:27017" --db=ai_job_application_agent_test ./backup/<timestamp>/ai_job_application_agent
   ```
3. **Verify restored data:**
   - User records: `db.users.countDocuments()`
   - Candidate profiles: `db.candidateprofiles.countDocuments()`
   - Resume metadata: `db.resumes.countDocuments()`
   - Job records: `db.jobs.countDocuments()`
   - Application preparations: `db.applicationpreparations.countDocuments()`
   - Component-level provenance: verify `materialsProvenance` and component `provenance` fields are present
4. **Restore to production** only after verification:
   ```bash
   mongorestore --uri="mongodb://<production-uri>" --db=ai_job_application_agent --drop ./backup/<timestamp>/ai_job_application_agent
   ```
5. **Restart the backend server** and verify health endpoint.

### Post-Restore Integrity Checks

- Verify user authentication works (login with existing credentials)
- Verify candidate profiles load correctly
- Verify resume metadata and storage references
- Verify job listings and search
- Verify application preparations and their provenance
- Verify cross-component consistency (no orphaned references)

### Environment Configuration Restoration

Store environment variables securely (password manager, secret manager, or Render dashboard). Required variables:
- `MONGODB_URI`, `MONGODB_DB`
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`
- `CLIENT_URL`
- `AI_PROVIDER` (mock/ollama)
- `STORAGE_PROVIDER`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_RESUME_BUCKET`
- `RESUME_STORAGE_PATH` (if using local storage with persistent disk)

### Resume Object Restoration

If using Supabase Storage:
- Resume files are stored in the Supabase bucket under `{userId}/{opaqueFilename}`
- Supabase Storage has its own backup/recovery (point-in-time recovery on Pro plan)
- Restore by re-uploading from backup or re-analyzing from original files

If using local storage:
- Resume files are stored under `RESUME_STORAGE_PATH/{userId}/{opaqueFilename}`
- Back up this directory alongside the MongoDB backup
- Restore by copying files back to the same path

### Rollback Procedure

If a restore introduces issues:
1. Stop the backend server
2. Restore the previous backup
3. Restart the backend server
4. Verify health endpoint and basic functionality

### Backup Verification

Periodically verify backups by:
1. Restoring to a test database
2. Running a subset of integration tests against the restored data
3. Comparing document counts with production

---

## Resume Storage Migration (Local → Supabase)

If migrating from local to Supabase storage:

1. **Dry run first:** List all resumes and their storage keys without modifying anything
2. **Upload to Supabase:** For each resume, upload the file to Supabase under the same key
3. **Verify:** Check that the file exists in Supabase and matches the original
4. **Update metadata:** Set `storageProvider: 'supabase'` on each resume record
5. **Preserve originals:** Do not delete local files until verification succeeds
6. **Record failures:** Log any upload/verification failures for manual reconciliation

Do not run a destructive migration automatically. Use a controlled script with dry-run support.
