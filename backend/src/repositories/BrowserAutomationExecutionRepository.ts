/** Browser automation execution repository (Phase 9.1). */

import { Types } from 'mongoose';
import { BrowserAutomationExecutionModel, IAutomationExecution } from '../models/BrowserAutomationExecution.js';
import { NotFoundError } from '../utils/errors.js';

export class BrowserAutomationExecutionRepository {
  async create(data: Partial<IAutomationExecution>): Promise<IAutomationExecution> {
    const execution = new BrowserAutomationExecutionModel(data);
    return execution.save();
  }

  async findByIdAndUserId(
    executionId: Types.ObjectId | string,
    userId: Types.ObjectId | string,
  ): Promise<IAutomationExecution | null> {
    return BrowserAutomationExecutionModel.findOne({ _id: executionId, userId }).lean().exec() as Promise<IAutomationExecution | null>;
  }

  async findByIdAndUserIdOrThrow(
    executionId: Types.ObjectId | string,
    userId: Types.ObjectId | string,
  ): Promise<IAutomationExecution> {
    // Find the execution by ID only first, to confirm it exists
    const exec = await BrowserAutomationExecutionModel.findById(executionId).lean().exec() as unknown as IAutomationExecution | null;
    if (!exec) {
      throw new NotFoundError('BrowserAutomationExecution', executionId.toString());
    }
    // Then verify ownership matches the requesting user
    if (exec.userId.toString() !== userId.toString()) {
      throw new NotFoundError('BrowserAutomationExecution', executionId.toString());
    }
    return exec;
  }

  async findByIdAndUserIdStrict(
    executionId: Types.ObjectId | string,
    userId: Types.ObjectId | string,
  ): Promise<IAutomationExecution> {
    // Find the execution by ID only first (without user filter in the query),
    // then verify ownership matches the requesting user
    const exec = await BrowserAutomationExecutionModel.findById(executionId).lean().exec() as unknown as IAutomationExecution | null;
    if (!exec) {
      throw new NotFoundError('BrowserAutomationExecution', executionId.toString());
    }
    if (exec.userId.toString() !== userId.toString()) {
      throw new NotFoundError('BrowserAutomationExecution', executionId.toString());
    }
    return exec;
  }

  async listByUserId(
    userId: Types.ObjectId | string,
    options: { page?: number; pageSize?: number } = {},
  ): Promise<{ executions: IAutomationExecution[]; total: number; page: number; pageSize: number; totalPages: number }> {
    const { page = 1, pageSize = 20 } = options;
    const limit = Math.min(pageSize, 100);
    const skip = (page - 1) * limit;

    const [executions, total] = await Promise.all([
      BrowserAutomationExecutionModel.find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      BrowserAutomationExecutionModel.countDocuments({ userId }).exec(),
    ]);

    return {
      executions: executions as unknown as IAutomationExecution[],
      total,
      page,
      pageSize: limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async update(
    executionId: Types.ObjectId | string,
    userId: Types.ObjectId | string,
    data: Partial<IAutomationExecution>,
  ): Promise<IAutomationExecution | null> {
    return BrowserAutomationExecutionModel.findOneAndUpdate(
      { _id: executionId, userId },
      { $set: data },
      { new: true, runValidators: true },
    ).lean().exec() as Promise<IAutomationExecution | null>;
  }
}