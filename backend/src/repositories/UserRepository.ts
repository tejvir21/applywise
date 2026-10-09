/** User repository for database operations. */

import { UserModel, IUser } from '../models/User.js';
import { NotFoundError } from '../utils/errors.js';

export interface CreateUserData {
  email: string;
  passwordHash: string;
}

export interface UserPublic {
  id: string;
  email: string;
  createdAt: Date;
  isActive: boolean;
}

export class UserRepository {
  async create(data: CreateUserData): Promise<IUser> {
    const user = new UserModel(data);
    return user.save();
  }

  async findByEmail(email: string): Promise<IUser | null> {
    return UserModel.findOne({ email: new RegExp(`^${email}$`, 'i') }).exec();
  }

  async findById(id: string): Promise<IUser | null> {
    if (!mongoose.isValidObjectId(id)) return null;
    return UserModel.findById(id).exec();
  }

  async findByIdOrThrow(id: string): Promise<IUser> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundError('User', id);
    return user;
  }

  async updateLastLogin(id: string): Promise<IUser | null> {
    return UserModel.findByIdAndUpdate(
      id,
      { lastLogin: new Date(), updatedAt: new Date() },
      { new: true }
    ).exec();
  }

  async emailExists(email: string): Promise<boolean> {
    const count = await UserModel.countDocuments({ email: new RegExp(`^${email}$`, 'i') }).exec();
    return count > 0;
  }

  toPublic(user: IUser): UserPublic {
    return {
      id: user._id.toString(),
      email: user.email,
      createdAt: user.createdAt,
      isActive: user.isActive,
    };
  }
}

// Import mongoose for ObjectId validation
import mongoose from 'mongoose';