import { Router } from 'express'
import authMiddleware from '../../middleware/auth.middleware'
import userController from '../../controllers/user.controller'
import { wrapAsync } from '../../utils/response'
import userMiddleware from '../../middleware/user.middleware'
import helpersMiddleware from '../../middleware/helpers.middleware'
import express from 'express'
import { sendPromptGemini, detectIntentGemini, extractProductNameGemini } from '../../utils/gemini.service'
import { getContext, appendMessageToContext } from '../../utils/chatContext.service'
import { v4 as uuidv4 } from 'uuid'
import { ProductModel } from '../../database/models/product.model'
import { CLIENT_RENEG_LIMIT } from 'node:tls'

declare namespace Express {
  interface Request {
    user?: { id: string; roles?: string[];[key: string]: any };
    jwtDecoded?: { id: string;[key: string]: any };
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

commonUserRouter.post('/chatbot', async (req, res) => {
  const { prompt } = req.body
  let userId = (req as any).user && (req as any).user._id ? (req as any).user._id : undefined
  let sessionId = req.headers['x-session-id'] || req.cookies?.sessionId
  if (!userId && !sessionId) {
    sessionId = uuidv4()
    res.cookie && res.cookie('sessionId', sessionId, { httpOnly: true })
  }
  if (!prompt) {
    return res.status(400).json({ message: 'Prompt is required' })
  }
  const intent = await detectIntentGemini(prompt)
  const context = await getContext({ userId, sessionId })
  const history = context?.messages || []
  let geminiPrompt = ''
  history.forEach(msg => {
    geminiPrompt += `${msg.role === 'user' ? 'Người dùng' : 'Trợ lý'}: ${msg.content}\n`
  })
  geminiPrompt += `Người dùng: ${prompt}\nTrợ lý:`

  let reply = ''
  // Nếu intent là add_to_cart
  if (intent === 'add_to_cart') {
    // 1. Dùng AI trích xuất tên sản phẩm
    const extractedName = await extractProductNameGemini(prompt)
    // 2. Tìm sản phẩm gần đúng trong DB
    const product = await ProductModel.findOne({ name: { $regex: extractedName, $options: 'i' } }).lean() as any
    if (!product) {
      reply = `Xin lỗi, cửa hàng không tìm thấy sản phẩm "${extractedName}" để thêm vào giỏ hàng.`
    } else {
      // 3. Thêm vào giỏ hàng trong context
      let cart = context?.cart || []
      // Kiểm tra đã có trong giỏ chưa
      const existIdx = cart.findIndex((item: any) => item._id?.toString() === product._id?.toString())
      if (existIdx > -1) {
        cart[existIdx].quantity += 1
      } else {
        cart.push({ _id: product._id, name: product.name, price: product.price, quantity: 1 })
      }
      // Lưu lại context với cart mới
      await appendMessageToContext({
        userId,
        sessionId,
        message: { role: 'user', content: prompt, timestamp: new Date() },
        lastIntent: intent,
        cart
      })
      await appendMessageToContext({
        userId,
        sessionId,
        message: { role: 'assistant', content: `Đã thêm sản phẩm "${product.name}" vào giỏ hàng của bạn.`, timestamp: new Date() },
        lastIntent: intent,
        cart
      })
      reply = `Đã thêm sản phẩm "${product.name}" vào giỏ hàng của bạn.`
      return res.json({ reply, intent, sessionId, cart })
    }
  }
  // Nếu intent là search_product
  else if (intent === 'search_product') {
    const products = await ProductModel.find({}).limit(10).lean()
    if (!products || products.length === 0) {
      reply = 'Hiện tại cửa hàng chưa có sản phẩm nào để giới thiệu cho bạn.'
    } else {
      const productList = products.map(p => `- ${(p as any).name} (${(p as any).price.toLocaleString()}đ)`).join('\n')
      const dataPrompt = `Dưới đây là danh sách các mẫu điện thoại cửa hàng đang bán:\n${productList}\nChỉ được phép trả lời dựa trên danh sách trên, không được bịa thêm hoặc sử dụng kiến thức ngoài danh sách này.\nNếu khách hỏi về mẫu không có trong danh sách, hãy lịch sự thông báo là hiện cửa hàng không có mẫu đó.\nCâu hỏi của khách: \"${prompt}\"`
      reply = await sendPromptGemini(dataPrompt)
    }
  }
  // Nếu intent là view_cart
  else if (intent === 'view_cart') {
    const cart = context?.cart || []
    if (!cart.length) {
      reply = 'Giỏ hàng của bạn hiện đang trống.'
    } else {
      const cartList = cart.map((item: any, idx: number) => `${idx + 1}. ${item.name} - ${item.quantity} x ${(item.price).toLocaleString()}đ`).join('\n')
      reply = `Giỏ hàng của bạn gồm:\n${cartList}`
    }
    // Lưu lại hội thoại
    await appendMessageToContext({
      userId,
      sessionId,
      message: { role: 'user', content: prompt, timestamp: new Date() },
      lastIntent: intent,
      cart
    })
    await appendMessageToContext({
      userId,
      sessionId,
      message: { role: 'assistant', content: reply, timestamp: new Date() },
      lastIntent: intent,
      cart
    })
    return res.json({ reply, intent, sessionId, cart })
  }
  // Nếu intent là order
  else if (intent === 'order') {
    const cart = context?.cart || []
    if (!cart.length) {
      reply = 'Giỏ hàng của bạn đang trống, vui lòng thêm sản phẩm trước khi đặt hàng.'
    } else {
      // Tạo đơn hàng demo (chỉ trả về thông tin, không lưu DB)
      const total = cart.reduce((sum: number, item: any) => sum + item.price * item.quantity, 0)
      const orderInfo = cart.map((item: any, idx: number) => `${idx + 1}. ${item.name} - ${item.quantity} x ${(item.price).toLocaleString()}đ`).join('\n')
      reply = `Đơn hàng của bạn đã được ghi nhận với các sản phẩm sau:\n${orderInfo}\nTổng tiền: ${total.toLocaleString()}đ.\nCảm ơn bạn đã đặt hàng!`
      // Xóa giỏ hàng trong context
      await appendMessageToContext({
        userId,
        sessionId,
        message: { role: 'user', content: prompt, timestamp: new Date() },
        lastIntent: intent,
        cart: []
      })
      await appendMessageToContext({
        userId,
        sessionId,
        message: { role: 'assistant', content: reply, timestamp: new Date() },
        lastIntent: intent,
        cart: []
      })
      return res.json({ reply, intent, sessionId, order: cart, total })
    }
    // Lưu lại hội thoại nếu giỏ hàng trống
    await appendMessageToContext({
      userId,
      sessionId,
      message: { role: 'user', content: prompt, timestamp: new Date() },
      lastIntent: intent,
      cart
    })
    await appendMessageToContext({
      userId,
      sessionId,
      message: { role: 'assistant', content: reply, timestamp: new Date() },
      lastIntent: intent,
      cart
    })
    return res.json({ reply, intent, sessionId, cart })
  }
  else {
    reply = await sendPromptGemini(geminiPrompt)
  }

  await appendMessageToContext({
    userId,
    sessionId,
    message: { role: 'user', content: prompt, timestamp: new Date() },
    lastIntent: intent
  })
  await appendMessageToContext({
    userId,
    sessionId,
    message: { role: 'assistant', content: reply, timestamp: new Date() },
    lastIntent: intent
  })
  res.json({ reply, intent, sessionId })
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
