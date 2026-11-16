import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

describe('replica set smoke', () => {
  let replSet: MongoMemoryReplSet;
  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(replSet.getUri());
  });
  afterAll(async () => {
    await mongoose.disconnect();
    await replSet.stop();
  });
  it('transaction commits', async () => {
    const session = await mongoose.startSession();
    await session.withTransaction(async () => {
      await mongoose.connection.db?.collection('smoke').insertOne({ x: 1 }, { session });
    });
    await session.endSession();
    const doc = await mongoose.connection.db?.collection('smoke').findOne({ x: 1 });
    expect(doc).toBeTruthy();
  });
});
