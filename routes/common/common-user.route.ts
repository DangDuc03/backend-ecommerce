import { Router } from 'express'
import authMiddleware from '../../middleware/auth.middleware'
import userController from '../../controllers/user.controller'
import { wrapAsync } from '../../utils/response'
import userMiddleware from '../../middleware/user.middleware'
import helpersMiddleware from '../../middleware/helpers.middleware'
import express from 'express'
import { sendPromptGemini } from '../../utils/gemini.service'

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

commonUserRouter.post('/chatbot', async (req, res) => {
  const { prompt } = req.body
  if (!prompt) {
    return res.status(400).json({ message: 'Prompt is required' })
  }
  const reply = await sendPromptGemini(prompt)
  res.json({ reply })
})

const router = express.Router()

router.post('/chatbot', async (req, res) => {
  const { prompt } = req.body
  if (!prompt) {
    return res.status(400).json({ message: 'Prompt is required' })
  }
  const reply = await sendPromptGemini(prompt)
  res.json({ reply })
})

export default commonUserRouter
