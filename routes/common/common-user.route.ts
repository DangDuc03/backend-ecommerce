import { Router } from 'express'
import authMiddleware from '../../middleware/auth.middleware'
import userController from '../../controllers/user.controller'
import { wrapAsync } from '../../utils/response'
import userMiddleware from '../../middleware/user.middleware'
import helpersMiddleware from '../../middleware/helpers.middleware'

declare namespace Express {
  interface Request {
    user?: { id: string; roles?: string[]; [key: string]: any }
    jwtDecoded?: { id: string; [key: string]: any }
  }
}

const commonUserRouter = Router()

commonUserRouter.get(
  '/me',
  authMiddleware.verifyAccessToken,
  wrapAsync(userController.getDetailMySelf)
)
commonUserRouter.put(
  '/me',
  authMiddleware.verifyAccessToken,
  userMiddleware.updateUserRules(),
  helpersMiddleware.entityValidator,
  wrapAsync(userController.updateMe)
)

commonUserRouter.put(
  '/:user_id/status',
  authMiddleware.verifyAccessToken,
  helpersMiddleware.idValidator,
  wrapAsync(userController.updateOnlineStatus)
)

export default commonUserRouter
