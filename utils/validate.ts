import { Request } from "express"
import { ROLE } from "../constants/role.enum"
import mongoose from 'mongoose'

// Extend Express Request interface to include jwtDecoded
declare module 'express-serve-static-core' {
  interface Request {
    jwtDecoded?: {
      roles?: string[]
      id: string;
      // add other properties if needed
    }
  }
}

const REGEX_EMAIL = /^[a-z][a-z0-9_\.]{5,32}@[a-z0-9]{2,}(\.[a-z0-9]{2,4}){1,2}$/
export const isEmail = (email: string) => {
  return REGEX_EMAIL.test(email)
}

export const isAdmin = (req: Request) => {
  return req.jwtDecoded?.roles?.includes(ROLE.ADMIN)
}

export const isMongoId = (id) => mongoose.Types.ObjectId.isValid(id)
