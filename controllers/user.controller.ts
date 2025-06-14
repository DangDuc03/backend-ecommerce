import { hashValue } from '../utils/crypt'
import { Request, Response } from 'express'
import { responseSuccess, ErrorHandler } from '../utils/response'
import { UserModel, IUser } from '../database/models/user.model'
import { STATUS } from '../constants/status'
import { omitBy, omit } from 'lodash'
import { uploadFile } from '../utils/upload'
import { FOLDERS, ROUTE_IMAGE } from '../constants/config'
import { CLIENT_RENEG_LIMIT } from 'node:tls'

declare global {
  namespace Express {
    interface Request {
      user?: IUser
    }
  }
}

const addUser = async (req: Request, res: Response) => {
  const form: IUser = req.body
  const {
    email,
    password,
    address,
    date_of_birth,
    name,
    phone,
    roles,
    avatar,
  } = form
  const userInDB = await UserModel.findOne({ email: email }).exec()
  if (!userInDB) {
    const hashedPassword = hashValue(password)
    const user: Partial<IUser> = {
      email,
      password: hashedPassword,
      roles,
      address,
      date_of_birth,
      name,
      phone,
      avatar,
    }
    Object.keys(user).forEach(
      (key) =>
        user[key as keyof typeof user] === undefined &&
        delete user[key as keyof typeof user]
    )
    const userAdd = await new UserModel(user).save()
    const response = {
      message: 'Tạo người dùng thành công',
      data: userAdd.toObject({
        transform: (doc, ret, option) => {
          delete ret.password
          delete ret.__v
          return ret
        },
      }),
    }
    return responseSuccess(res, response)
  }
  throw new ErrorHandler(422, { email: 'Email đã tồn tại' })
}

const getUsers = async (req: Request, res: Response) => {
  const usersDB = await UserModel.find({})
    .select({ password: 0, __v: 0 })
    .lean<IUser[]>()
  const response = {
    message: 'Lấy người dùng thành công',
    data: usersDB,
  }
  return responseSuccess(res, response)
}

const getDetailMySelf = async (req: Request, res: Response) => {
    const response = {
      message: 'Lấy người dùng thành công',
    data: req.user,
    }
    return responseSuccess(res, response)
}

const getUser = async (req: Request, res: Response) => {
  const userDB = await UserModel.findById(req.params.user_id)
    .select({ password: 0, __v: 0 })
    .lean<IUser>()
  if (userDB) {
    const response = {
      message: 'Lấy người dùng thành công',
      data: userDB,
    }
    return responseSuccess(res, response)
  } else {
    throw new ErrorHandler(STATUS.BAD_REQUEST, 'Không tìm thấy người dùng')
  }
}

const updateUser = async (req: Request, res: Response) => {
  const form: IUser = req.body
  const { password, address, date_of_birth, name, phone, roles, avatar } = form
  const user: Partial<IUser> = omitBy(
    {
      password,
      address,
      date_of_birth,
      name,
      phone,
      roles,
      avatar,
    },
    (value) => value === undefined || value === ''
  )
  const userDB = await UserModel.findByIdAndUpdate(req.params.user_id, user, {
    new: true,
  })
    .select({ password: 0, __v: 0 })
    .lean<IUser>()
  if (userDB) {
    const response = {
      message: 'Cập nhật người dùng thành công',
      data: userDB,
    }
    return responseSuccess(res, response)
  } else {
    throw new ErrorHandler(STATUS.BAD_REQUEST, 'Không tìm thấy người dùng')
  }
}

const uploadAvatar = async (req: Request, res: Response) => {
  const path = await uploadFile(req, FOLDERS.AVATAR)
  const response = {
    message: 'Upload ảnh đại diện thành công',
    data: path,
  }
  return responseSuccess(res, response)
}

interface IUpdateMeBody extends IUser {
  new_password?: string
}

const updateMe = async (req: Request, res: Response) => {
  const form: IUpdateMeBody = req.body
  const {
    password,
    new_password,
    address,
    date_of_birth,
    name,
    phone,
    avatar,
  } = form
  const user: Partial<IUser> = omitBy(
    {
      password,
      address,
      date_of_birth,
      name,
      phone,
      avatar,
    },
    (value) => value === undefined || value === ''
  )

  const userDB = req.user

  if (user.password && new_password) {
    const isPasswordMatch = hashValue(password) === userDB.password
    if (isPasswordMatch) {
      user.password = hashValue(new_password)
    } else {
      throw new ErrorHandler(STATUS.UNPROCESSABLE_ENTITY, {
        password: 'Password không đúng',
      })
    }
  }

  const updatedUserDB = await UserModel.findByIdAndUpdate(userDB._id, user, {
    new: true,
  })
    .select({ password: 0, __v: 0 })
    .lean<IUser>()

  const response = {
    message: 'Cập nhật thông tin thành công',
    data: updatedUserDB,
  }
  return responseSuccess(res, response)
}

const deleteUser = async (req: Request, res: Response) => {
  const user_id = req.params.user_id
  const userDB = await UserModel.findByIdAndDelete(user_id).lean<IUser>()
  if (userDB) {
    return responseSuccess(res, { message: 'Xóa thành công' })
  } else {
    throw new ErrorHandler(STATUS.BAD_REQUEST, 'Không tìm thấy người dùng')
  }
}

const updateOnlineStatus = async (req: Request, res: Response) => {
  const user_Id = req.params.user_id
  const { isOnline, lastActive } = req.body
  // Validate input
  if (typeof isOnline !== 'boolean' || !lastActive) {
    throw new ErrorHandler(STATUS.UNPROCESSABLE_ENTITY, {
      isOnline: 'Must be a boolean',
      lastActive: 'Must be a valid date'
    })
  }

  const user = await UserModel.findById(user_Id)
  if (!user) {
    throw new ErrorHandler(STATUS.NOT_FOUND, 'User not found')
  }

  (user as any).isOnline = isOnline as boolean
  (user as any).lastActive = new Date(lastActive)
  await user.save()

  const sanitizedUser = omit(user.toObject(), ['password', '__v'])
  return responseSuccess(res, {
    message: 'Update online status successfully',
    data: sanitizedUser
  })
}

const userController = {
  addUser,
  getUsers,
  getDetailMySelf,
  getUser,
  updateUser,
  deleteUser,
  updateMe,
  uploadAvatar,
  updateOnlineStatus,
}

export default userController
