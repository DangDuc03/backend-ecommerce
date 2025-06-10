import mongoose, { Schema, Document } from 'mongoose'
import { ROLE } from '../../constants/role.enum'

export interface IUser extends Document {
  email: string
  name?: string
  password?: string
  date_of_birth?: Date
  address?: string
  phone?: string
  roles: string[]
  avatar?: string
  isOnline?: boolean
  lastActive?: Date
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, minlength: 5, maxlength: 160 },
    name: { type: String, maxlength: 160 },
    password: { type: String, required: true, minlength: 6, maxlength: 160 },
    date_of_birth: { type: Date, maxlength: 160 },
    address: { type: String, maxlength: 160 },
    phone: { type: String, maxlength: 20 },
    roles: { type: [String], required: true, default: [ROLE.USER] },
    avatar: { type: String, maxlength: 1000 },
    isOnline: { type: Boolean, default: false },
    lastActive: { type: Date, default: Date.now }
  },
  {
    timestamps: true,
  }
)

// Index cho việc tìm kiếm user online
UserSchema.index({ isOnline: 1, lastActive: -1 })

export const UserModel = mongoose.model<IUser>('users', UserSchema)
