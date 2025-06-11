import { Router } from 'express'
import authMiddleware from '../../middleware/auth.middleware'

import { wrapAsync } from '../../utils/response'
import chatbotController from '../../controllers/chatbot.controller'

const commonChatbotRouter = Router()

commonChatbotRouter.post(
  '/chatbot',
  authMiddleware.verifyAccessTokenOptional,
  wrapAsync(chatbotController.handleChatPrompt)
)

commonChatbotRouter.get(
  '/chatbot/history',
  authMiddleware.verifyAccessToken,
  wrapAsync(chatbotController.getChatHistory)
)

export default commonChatbotRouter 