import { config } from '../constants/config'
import { verifyToken } from '../utils/jwt'
import { NextFunction, Request, Response } from 'express'
import { ROLE } from '../constants/role.enum'
import { responseError, ErrorHandler } from '../utils/response'
import { STATUS } from '../constants/status'
import { AccessTokenModel } from '../database/models/access-token.model'
import { RefreshTokenModel } from '../database/models/refresh-token.model'
import { body } from 'express-validator'
import { UserModel, IUser } from '../database/models/user.model'

interface PayloadToken {
  id: string
  roles: string[]
  [key: string]: any
}

const verifyAccessToken = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const access_token = req.headers.authorization?.replace('Bearer ', '')
  if (!access_token) {
    return responseError(
      res,
      new ErrorHandler(STATUS.UNAUTHORIZED, 'Token không được gửi')
    )
  }
    try {
      const decoded = (await verifyToken(
        access_token,
        config.SECRET_KEY
      )) as PayloadToken
      req.jwtDecoded = decoded

    const user = await UserModel.findById(decoded.id).lean<IUser>()
    if (!user) {
      return responseError(
        res,
        new ErrorHandler(
          STATUS.UNAUTHORIZED,
          'Không tìm thấy người dùng từ token'
        )
      )
    }
    req.user = user
    next()
    } catch (error) {
      return responseError(res, error)
    }
}

const verifyAccessTokenOptional = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const access_token = req.headers.authorization?.replace('Bearer ', '')
  if (!access_token) {
    return next()
  }
  try {
    const decoded = (await verifyToken(
      access_token,
      config.SECRET_KEY
    )) as PayloadToken
    req.jwtDecoded = decoded

    const user = await UserModel.findById(decoded.id).lean<IUser>()
    if (user) {
      req.user = user
    }
    next()
  } catch (error) {
    // Bỏ qua lỗi token không hợp lệ và cho qua
    next()
  }
}

const verifyRefreshToken = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const refresh_token = req.body.refresh_token
  if (refresh_token) {
    try {
      const decoded = (await verifyToken(
        refresh_token,
        config.SECRET_KEY
      )) as PayloadToken
      req.jwtDecoded = decoded
      const refreshTokenDB = await RefreshTokenModel.findOne({
        token: refresh_token,
      }).exec()

      if (refreshTokenDB) {
        return next()
      }
      return responseError(
        res,
        new ErrorHandler(STATUS.UNAUTHORIZED, 'Không tồn tại token')
      )
    } catch (error) {
      return responseError(res, error)
    }
  }
  return responseError(
    res,
    new ErrorHandler(STATUS.UNAUTHORIZED, 'Token không được gửi')
  )
}

const verifyAdmin = async (req: Request, res: Response, next: NextFunction) => {
  if (req.user && req.user.roles.includes(ROLE.ADMIN)) {
    return next()
  }
  return responseError(
    res,
    new ErrorHandler(STATUS.FORBIDDEN, 'Không có quyền truy cập')
  )
}

const registerRules = () => {
  return [
    body('email')
      .isEmail()
      .withMessage('Email không đúng định dạng')
      .isLength({ min: 5, max: 160 })
      .withMessage('Email phải từ 5-160 kí tự'),
    body('password')
      .exists({ checkFalsy: true })
      .withMessage('Mật khẩu không được để trống')
      .isLength({ min: 6, max: 160 })
      .withMessage('Mật khẩu phải từ 6-160 kí tự'),
  ]
}

const loginRules = () => {
  return [
    body('email')
      .isEmail()
      .withMessage('Email không đúng định dạng')
      .isLength({ min: 5, max: 160 })
      .withMessage('Email phải từ 5-160 kí tự'),
    body('password')
      .isLength({ min: 6, max: 160 })
      .withMessage('Mật khẩu phải từ 6-160 kí tự'),
  ]
}

const authMiddleware = {
  verifyAccessToken,
  verifyAdmin,
  registerRules,
  loginRules,
  verifyRefreshToken,
  verifyAccessTokenOptional,
}

export default authMiddleware
