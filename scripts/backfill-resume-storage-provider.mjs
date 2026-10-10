/**
 * Backfill `storageProvider` on legacy resume documents.
 *
 * Background: documents written before Supabase support predate any
 * non-local backend, so a missing `storageProvider` safely defaults to
 * 'local' at read time (see providerNameForRecord). This script makes that
 * default explicit in the database.
 *
 * It never guesses: only documents with a missing/empty field are updated,
 * and only to 'local'. Documents with an unrecognized provider value are
 * reported and left untouched for operator reconciliation. No files are
 * moved, migrated, or deleted.
 *
 * Usage:
 *   node scripts/backfill-resume-storage-provider.mjs [--dry-run]
 *   DRY_RUN=1 node scripts/backfill-resume-storage-provider.mjs
 */
import 'dotenv/config';
import mongoose from 'mongoose';

const dryRun = process.argv.includes('--dry-run') || process.env.DRY_RUN === '1';

async function main() {
  const uri = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017';
  const dbName = process.env.MONGODB_DB ?? 'ai_job_application_agent';
  await mongoose.connect(uri, { dbName });
  const collection = mongoose.connection.db.collection('resumes');

  const missingFilter = {
    $or: [{ storageProvider: { $exists: false } }, { storageProvider: null }, { storageProvider: '' }],
  };
  const missingCount = await collection.countDocuments(missingFilter);
  const unknown = await collection
    .find({ storageProvider: { $nin: ['local', 'supabase', null, ''] } })
    .project({ _id: 1, storageProvider: 1 })
    .limit(100)
    .toArray();

  console.log(`Legacy resumes missing storageProvider: ${missingCount}`);
  console.log(`Resumes with unrecognized storageProvider: ${unknown.length}`);
  for (const doc of unknown) {
    console.log(`  - ${doc._id}: ${JSON.stringify(doc.storageProvider)} (left untouched)`);
  }

  if (dryRun) {
    console.log('Dry run: no changes written.');
  } else if (missingCount > 0) {
    const result = await collection.updateMany(missingFilter, { $set: { storageProvider: 'local' } });
    console.log(`Backfilled ${result.modifiedCount} resume(s) to storageProvider='local'.`);
  } else {
    console.log('Nothing to backfill.');
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
