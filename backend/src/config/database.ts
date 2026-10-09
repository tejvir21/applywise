/** MongoDB connection with graceful degradation. */

import mongoose from 'mongoose';
import { getConfig } from './index.js';
import { createChildLogger } from './logger.js';

const log = createChildLogger({ module: 'database' });

let isConnected = false;

export async function connectToDatabase(): Promise<void> {
  const config = getConfig();
  try {
    await mongoose.connect(config.MONGODB_URI, {
      dbName: config.MONGODB_DB,
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    });
    isConnected = true;
    log.info({ db: config.MONGODB_DB }, 'MongoDB connected');
  } catch (err) {
    isConnected = false;
    log.warn({ err, uri: config.MONGODB_URI }, 'MongoDB connection failed - running in degraded mode');
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    isConnected = false;
    log.info('MongoDB disconnected');
  }
}

export function getConnectionStatus(): 'connected' | 'disconnected' | 'connecting' | 'disconnecting' | 'error' {
  if (!isConnected) return 'disconnected';
  switch (mongoose.connection.readyState) {
    case 1: return 'connected';
    case 2: return 'connecting';
    case 3: return 'disconnecting';
    default: return 'error';
  }
}

export function isDatabaseConnected(): boolean {
  return isConnected && mongoose.connection.readyState === 1;
}

export async function createIndexes(): Promise<void> {
  if (!isDatabaseConnected()) return;

  try {
    // Note: Indexes for collections with Mongoose models (users, profiles, resumes, jobs, savedjobs)
    // are automatically created from schema definitions. We only manually create indexes
    // for collections without Mongoose models.

    // Job Matches (no Mongoose model)
    await mongoose.connection.db?.collection('jobmatches').createIndex({ userId: 1 });
    await mongoose.connection.db?.collection('jobmatches').createIndex({ jobId: 1 });
    await mongoose.connection.db?.collection('jobmatches').createIndex({ userId: 1, jobId: 1 }, { unique: true });

    // Applications (no Mongoose model)
    await mongoose.connection.db?.collection('applications').createIndex({ userId: 1 });
    await mongoose.connection.db?.collection('applications').createIndex({ jobId: 1 });
    await mongoose.connection.db?.collection('applications').createIndex({ status: 1 });
    await mongoose.connection.db?.collection('applications').createIndex({ createdAt: -1 });

    // Application Events / Audit Log (no Mongoose model)
    await mongoose.connection.db?.collection('applicationevents').createIndex({ applicationId: 1 });
    await mongoose.connection.db?.collection('applicationevents').createIndex({ userId: 1 });
    await mongoose.connection.db?.collection('applicationevents').createIndex({ createdAt: -1 });

    // Job Sources (no Mongoose model)
    await mongoose.connection.db?.collection('jobsources').createIndex({ userId: 1 });

    log.info('MongoDB indexes created for non-model collections');
  } catch (err) {
    log.warn({ err }, 'MongoDB index creation failed');
  }
}