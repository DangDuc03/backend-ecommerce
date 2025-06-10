import { Request, Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import {
  sendPromptAI,
  detectIntentAI,
  extractProductNameAI,
} from '../utils/ai.service'
import {
  getContext,
  appendMessageToContext,
} from '../utils/chatContext.service'
import {
  getRecentHistory,
  buildChatPrompt,
  mapCartFromPurchases,
} from '../utils/chatbot.utils'
import { ProductModel, IProduct } from '../database/models/product.model'
import { CategoryModel, ICategory } from '../database/models/category.model'
import { PurchaseModel, IPurchase, IPurchasePopulated } from '../database/models/purchase.model'
import OrderModel, { IOrder } from '../database/models/order.model'
import { UserModel, IUser } from '../database/models/user.model'
import { STATUS_PURCHASE } from '../constants/purchase'
import { generateNameId } from '../utils/helper'
import {
  IChatContext,
  IMessage,
} from '../database/models/chatContext.model'

// Map trạng thái đơn hàng sang tiếng Việt
const ORDER_STATUS_VI: Record<number, string> = {
  [STATUS_PURCHASE.WAIT_FOR_CONFIRMATION]: 'Chờ xác nhận',
  [STATUS_PURCHASE.WAIT_FOR_GETTING]: 'Chờ lấy hàng',
  [STATUS_PURCHASE.IN_PROGRESS]: 'Đang giao',
  [STATUS_PURCHASE.DELIVERED]: 'Đã giao',
  [STATUS_PURCHASE.CANCELLED]: 'Đã hủy',
}

declare global {
  namespace Express {
    interface Request {
      user?: IUser
    }
  }
}

const handleChatPrompt = async (req: Request, res: Response) => {
  const { prompt } = req.body
  const userId = req.user?._id.toString()
  let sessionId =
    (req.headers['x-session-id'] as string) || req.cookies?.sessionId
  let newSessionIdCreated = false

  if (!sessionId) {
    sessionId = uuidv4()
    newSessionIdCreated = true
  }

  if (!prompt) {
    return res.status(400).json({ message: 'Prompt is required' })
  }

  const intent = await detectIntentAI(prompt)
  const context = await getContext({ userId, sessionId })
  const aiHistory = getRecentHistory(context)
  const geminiPrompt = buildChatPrompt(aiHistory, prompt)

  let reply = ''

  const requiredLoginIntents = [
    'add_to_cart',
    'view_cart',
    'check_order_status',
    'order',
    'cancel_order',
    'change_cart_quantity',
    'update_profile',
  ]
  if (requiredLoginIntents.includes(intent) && !userId) {
    return res
      .status(401)
      .json({ message: 'Bạn cần đăng nhập để sử dụng tính năng này.' })
  }

  // Xử lý các intent
  switch (intent) {
    case 'add_to_cart': {
      await appendMessageToContext({
        userId,
        sessionId,
        message: { role: 'user', content: prompt, timestamp: new Date() },
        lastIntent: intent,
      })
      const extractPrompt = `Hãy trích xuất tên sản phẩm và số lượng từ câu sau (trả về đúng định dạng: <tên sản phẩm>|<số lượng>, nếu không có số lượng thì mặc định là 1, không giải thích):\n${prompt}`
      const extractResult = await sendPromptAI(extractPrompt, aiHistory)
      const [extractedName, quantityStr] = extractResult
        .split('|')
        .map((s) => s.trim())
      const quantity = parseInt(quantityStr, 10) || 1

      const product = await ProductModel.findOne({
        name: { $regex: extractedName, $options: 'i' },
      }).lean<IProduct>()

      if (!product) {
        reply = `Xin lỗi, cửa hàng không tìm thấy sản phẩm "${extractedName}" để thêm vào giỏ hàng.`
      } else {
        const purchase = await PurchaseModel.findOne({
          user: userId,
          status: STATUS_PURCHASE.IN_CART,
          product: product._id,
        })

        if (purchase) {
          purchase.buy_count += quantity
          await purchase.save()
        } else {
          await PurchaseModel.create({
            user: userId,
            product: product._id,
            buy_count: quantity,
            price: product.price,
            price_before_discount: product.price_before_discount,
            status: STATUS_PURCHASE.IN_CART,
          })
        }
        reply = `Đã thêm sản phẩm "${product.name}" vào giỏ hàng của bạn.`
      }

      await appendMessageToContext({
        userId,
        sessionId,
        message: { role: 'assistant', content: reply, timestamp: new Date() },
        lastIntent: intent,
      })
      if (newSessionIdCreated) {
        res.cookie('sessionId', sessionId, { httpOnly: true })
      }
      return res.json({ reply, intent, sessionId, user: req.user })
    }

    case 'view_cart': {
      const purchases = await PurchaseModel.find({
        user: userId,
        status: STATUS_PURCHASE.IN_CART,
      })
        .populate('product')
        .lean<IPurchasePopulated[]>()

      let orders: any[] = []
      if (!purchases.length) {
        reply = 'Giỏ hàng của bạn hiện đang trống.'
      } else {
        reply = `Giỏ hàng của bạn gồm ${purchases.length} sản phẩm như sau:`
        orders = purchases.map((item) => ({
          product_id: item.product?._id?.toString() || '',
          name: item.product?.name || '',
          image: item.product?.image || '',
          price: item.price,
          quantity: item.buy_count,
          status: 'Trong giỏ hàng',
          product_url:
            item.product?.name && item.product?._id
              ? `/${generateNameId({
                  name: item.product.name,
                  id: item.product._id.toString(),
                })}`
              : '',
        }))
      }
      await appendMessageToContext({
        userId,
        sessionId,
        message: { role: 'user', content: prompt, timestamp: new Date() },
        lastIntent: intent,
      })
      await appendMessageToContext({
        userId,
        sessionId,
        message: {
          role: 'assistant',
          content: reply,
          orders,
          timestamp: new Date(),
        },
        lastIntent: intent,
      })
      if (newSessionIdCreated) {
        res.cookie('sessionId', sessionId, { httpOnly: true })
      }
      return res.json({ reply, intent, sessionId, orders, user: req.user })
    }

    case 'check_order_status': {
      try {
        const orderIdMatch = prompt.match(/[a-f0-9]{24}/)
        if (orderIdMatch) {
          const orderId = orderIdMatch[0]
          const order = await OrderModel.findOne({
            _id: orderId,
            userId,
          }).lean<IOrder>()
          if (!order) {
            reply = `Không tìm thấy đơn hàng với mã ${orderId}.`
          } else {
            const statusVi = ORDER_STATUS_VI[order.status] || order.status
            reply = `Trạng thái đơn hàng ${orderId}: ${statusVi}. Tổng tiền: ${order.total.toLocaleString()}đ.`
          }
        } else {
          const ordersRaw = await OrderModel.find({
            userId,
            status: { $ne: STATUS_PURCHASE.CANCELLED },
          })
            .sort({ createdAt: -1 })
            .limit(2)
            .lean<IOrder[]>()
          if (!ordersRaw.length) {
            reply = 'Bạn chưa có đơn hàng nào.'
          } else {
            reply =
              `Đây là ${
                ordersRaw.length
              } đơn hàng gần nhất của bạn:\n` +
              ordersRaw
                .map(
                  (o) =>
                    `- Mã: ${o._id}, trạng thái: ${
                      ORDER_STATUS_VI[o.status]
                    }, tổng: ${o.total.toLocaleString()}đ`
                )
                .join('\n')
          }
        }
      } catch (err) {
        console.error('Lỗi check_order_status:', err)
        reply = 'Xin lỗi, có lỗi xảy ra. Vui lòng thử lại sau.'
      }
      break // Fallback to append messages
    }

    case 'order': {
      try {
        const userProfile = req.user
        if (
          !userProfile ||
          !userProfile.name ||
          !userProfile.phone ||
          !userProfile.address
        ) {
          reply =
            'Bạn cần cập nhật đầy đủ họ tên, số điện thoại và địa chỉ trước khi mua hàng.'
          return res.status(400).json({ message: reply, intent })
        }

        let purchasesToOrder: IPurchasePopulated[] = []

        // Dùng AI để xác định sản phẩm cần đặt
        const extractPrompt = `Hãy trích xuất tên sản phẩm muốn thanh toán từ câu sau. Nếu ý định là thanh toán toàn bộ giỏ hàng, trả về "tất cả". Nếu không có tên sản phẩm, trả về rỗng. Không giải thích, chỉ trả về đúng định dạng.\nCâu: ${prompt}`
        const extractResult = (
          await sendPromptAI(extractPrompt, aiHistory)
        ).trim()

        if (!extractResult || extractResult.toLowerCase() === 'rỗng') {
          reply =
            'Bạn muốn thanh toán toàn bộ giỏ hàng hay chỉ một số sản phẩm? Vui lòng nhập tên sản phẩm hoặc chọn "tất cả".'
        } else if (extractResult.toLowerCase() === 'tất cả') {
          purchasesToOrder = await PurchaseModel.find({
            user: userId,
            status: STATUS_PURCHASE.IN_CART,
          })
            .populate('product')
            .lean<IPurchasePopulated[]>()
        } else {
          // Tìm sản phẩm dựa trên tên trích xuất
          const product = await ProductModel.findOne({
            name: { $regex: extractResult, $options: 'i' },
          }).lean<IProduct>()
          if (!product) {
            reply = `Không tìm thấy sản phẩm "${extractResult}" trong giỏ hàng.`
          } else {
            const specificPurchases = await PurchaseModel.find({
              user: userId,
              status: STATUS_PURCHASE.IN_CART,
              product: product._id,
            })
              .populate('product')
              .lean<IPurchasePopulated[]>()
            if (specificPurchases.length > 0) {
              purchasesToOrder = specificPurchases
            } else {
              reply = `Sản phẩm "${extractResult}" không có trong giỏ hàng của bạn.`
            }
          }
        }

        if (purchasesToOrder.length > 0) {
          const purchaseIds = purchasesToOrder.map((item) => item._id)
          const total = purchasesToOrder.reduce(
            (sum, item) => sum + item.price * item.buy_count,
            0
          )
          const orderDoc = await OrderModel.create({
            userId,
            userName: userProfile.name,
            items: purchasesToOrder.map((item) => ({
              productId: item.product._id,
              name: item.product.name,
              price: item.price,
              quantity: item.buy_count,
            })),
            total,
            status: STATUS_PURCHASE.WAIT_FOR_CONFIRMATION,
            purchaseIds,
          })
          await PurchaseModel.updateMany(
            { _id: { $in: purchaseIds }, user: userId },
            { status: STATUS_PURCHASE.WAIT_FOR_CONFIRMATION }
          )
          reply = `Đơn hàng của bạn đã được ghi nhận. Mã đơn hàng: ${orderDoc._id}. Tổng tiền: ${total.toLocaleString()}đ. Cảm ơn bạn!`
        } else if (!reply) {
          // Chỉ set reply này nếu chưa có reply lỗi từ trước
          reply = 'Giỏ hàng của bạn đang trống hoặc không có sản phẩm phù hợp.'
        }
      } catch (err) {
        console.error('Lỗi order:', err)
        reply = 'Xin lỗi, có lỗi xảy ra khi đặt hàng. Vui lòng thử lại sau.'
      }
      break // Fallback to append messages
    }

    case 'cancel_order': {
      const orderIdMatch = prompt.match(/[a-f0-9]{24}/)
      if (!orderIdMatch) {
        reply = 'Bạn vui lòng cung cấp mã đơn hàng hợp lệ (24 ký tự) để hủy.'
      } else {
        const orderId = orderIdMatch[0]
        const order = await OrderModel.findOne({ _id: orderId, userId })
        if (!order) {
          reply = `Không tìm thấy đơn hàng với mã ${orderId}.`
        } else if (order.status !== STATUS_PURCHASE.WAIT_FOR_CONFIRMATION) {
          reply = `Đơn hàng ${orderId} không thể hủy vì đã được xử lý.`
        } else {
          order.status = STATUS_PURCHASE.CANCELLED
          await order.save()

          if (order.purchaseIds && order.purchaseIds.length > 0) {
            await PurchaseModel.updateMany(
              { _id: { $in: order.purchaseIds } },
              { status: STATUS_PURCHASE.CANCELLED }
            )
          }
          reply = `Đơn hàng ${orderId} đã được hủy thành công.`
        }
      }
      break // Fallback to append messages
    }

    case 'change_cart_quantity': {
      const extractPrompt = `Hãy trích xuất tên sản phẩm và số lượng mới từ câu sau (trả về đúng định dạng: <tên sản phẩm>|<số lượng>, không giải thích):\n${prompt}`
      const extractResult = await sendPromptAI(extractPrompt, aiHistory)
      const [productName, quantityStr] = extractResult
        .split('|')
        .map((s) => s.trim())
      const quantity = parseInt(quantityStr, 10)

      if (!productName || !quantity || isNaN(quantity) || quantity < 0) {
        reply =
          'Không xác định được tên sản phẩm hoặc số lượng mới. Bạn vui lòng nhập lại rõ ràng hơn.'
      } else {
        const product = await ProductModel.findOne({
          name: { $regex: productName, $options: 'i' },
        }).lean<IProduct>()
        if (!product) {
          reply = `Không tìm thấy sản phẩm "${productName}" trong hệ thống.`
        } else {
          const purchase = await PurchaseModel.findOne({
            user: userId,
            status: STATUS_PURCHASE.IN_CART,
            product: product._id,
          })
          if (!purchase) {
            reply = `Sản phẩm "${productName}" không có trong giỏ hàng của bạn.`
          } else {
            if (quantity === 0) {
              await purchase.remove()
              reply = `Đã xóa sản phẩm "${productName}" khỏi giỏ hàng của bạn.`
            } else {
              purchase.buy_count = quantity
              await purchase.save()
              reply = `Đã cập nhật số lượng "${productName}" trong giỏ hàng của bạn thành ${quantity} cái.`
            }
          }
        }
      }
      break // Fallback to append messages
    }

    case 'update_profile': {
      try {
        const extractPrompt = `Hãy trích xuất thông tin họ tên, số điện thoại và địa chỉ từ câu sau (trả về đúng định dạng: tên|<tên>, sđt|<số điện thoại>, địa chỉ|<địa chỉ>, nếu thiếu thông tin nào thì để trống, không giải thích):\n${prompt}`
        const extractResult = await sendPromptAI(extractPrompt, aiHistory)
        const infoMap = new Map<string, string>()
        extractResult.split(',').forEach((item) => {
          const [key, value] = item.split('|').map((s) => s.trim())
          if (key && value) infoMap.set(key, value)
        })

        const updateData: Partial<IUser> = {}
        if (infoMap.has('tên')) updateData.name = infoMap.get('tên')
        if (infoMap.has('sđt')) updateData.phone = infoMap.get('sđt')
        if (infoMap.has('địa chỉ')) updateData.address = infoMap.get('địa chỉ')

        if (Object.keys(updateData).length === 0) {
          reply =
            'Không xác định được thông tin cần cập nhật. Vui lòng nhập theo cú pháp: Cập nhật tên: <tên>, SĐT: <số điện thoại>, Địa chỉ: <địa chỉ>'
        } else {
          await UserModel.findByIdAndUpdate(userId, { $set: updateData })
          reply = `Đã cập nhật thông tin của bạn thành công.`
        }
      } catch (err) {
        console.error('Lỗi update_profile:', err)
        reply = 'Xin lỗi, có lỗi xảy ra khi cập nhật thông tin.'
      }
      // Special case: After updating, we should return the NEW user profile
      const updatedUser = await UserModel.findById(userId).lean<IUser>()
      await appendMessageToContext({
        userId,
        sessionId,
        message: { role: 'user', content: prompt, timestamp: new Date() },
        lastIntent: intent,
      })
      await appendMessageToContext({
        userId,
        sessionId,
        message: { role: 'assistant', content: reply, timestamp: new Date() },
        lastIntent: intent,
      })
      if (newSessionIdCreated) {
        res.cookie('sessionId', sessionId, { httpOnly: true })
      }
      return res.json({
        reply,
        intent,
        sessionId,
        user: updatedUser,
        profile: updatedUser,
      })
    }

    case 'search_product':
    case 'info': {
      let products: IProduct[] = []
      const categories = await CategoryModel.find({}).lean<ICategory[]>()
      if (!categories.length) {
        reply = 'Hiện tại cửa hàng chưa có danh mục sản phẩm nào.'
      } else {
        const categoryList = categories.map((c) => `- ${c.name}`).join('\n')
        const mentionedCategory = categories.find((c) =>
          prompt.toLowerCase().includes((c.name || '').toLowerCase())
        )

        if (!mentionedCategory) {
          const dataPrompt = `Dưới đây là các danh mục sản phẩm shop đang kinh doanh:\n${categoryList}\nBạn chỉ được phép trả lời dựa trên danh sách danh mục trên, không được bịa thêm. Nếu khách hỏi về sản phẩm cụ thể, hãy hướng dẫn khách chọn danh mục trước.\nCâu hỏi của khách: "${prompt}"\nHãy trả lời bằng tiếng Việt.`
          reply = await sendPromptAI(dataPrompt, aiHistory)
        } else {
          products = await ProductModel.find({
            category: mentionedCategory._id,
          }).lean<IProduct[]>()
          if (!products.length) {
            reply = `Hiện tại cửa hàng chưa có sản phẩm nào trong danh mục ${mentionedCategory.name}.`
          } else {
            const productList = products
              .map((p) => `- ${p.name} (${p.price.toLocaleString()}đ)`)
              .join('\n')
            const dataPrompt = `Dưới đây là các sản phẩm thuộc danh mục ${mentionedCategory.name}:\n${productList}\nChỉ được phép trả lời dựa trên danh sách trên, không được bịa thêm. Câu hỏi của khách: "${prompt}"\nHãy trả lời bằng tiếng Việt.`
            reply = await sendPromptAI(dataPrompt, aiHistory)
          }
        }
      }
      // Since reply is handled by AI, we just need to append messages and return
      await appendMessageToContext({
        userId,
        sessionId,
        message: { role: 'user', content: prompt, timestamp: new Date() },
        lastIntent: intent,
      })
      await appendMessageToContext({
        userId,
        sessionId,
        message: { role: 'assistant', content: reply, timestamp: new Date() },
        lastIntent: intent,
      })
      if (newSessionIdCreated) {
        res.cookie('sessionId', sessionId, { httpOnly: true })
      }
      return res.json({ reply, intent, sessionId, user: req.user })
    }

    case 'suggest_product': {
      let suggestedProducts: any[] = []
      try {
        const categories = await CategoryModel.find({}).lean<ICategory[]>()
        const extractPrompt = `Bạn là hệ thống trích xuất keyword/tên danh mục từ yêu cầu của khách hàng. Danh sách danh mục hiện có: ${categories
          .map((c) => c.name)
          .join(
            ', '
          )}. Hãy đọc câu sau và trả về duy nhất 1 keyword/tên danh mục phù hợp nhất (chỉ trả về 1 keyword/tên danh mục, không giải thích). Nếu không có, trả về rỗng.\nCâu: "${prompt}"`
        const extractedCategory = await sendPromptAI(extractPrompt)

        const matchedCategory = extractedCategory
          ? await CategoryModel.findOne({
              name: { $regex: extractedCategory, $options: 'i' },
            }).lean<ICategory>()
          : null

        let products: IProduct[] = []
        if (matchedCategory) {
          products = await ProductModel.find({ category: matchedCategory._id })
            .limit(5)
            .lean<IProduct[]>()
        }

        if (!products.length) {
          reply = matchedCategory
            ? `Rất tiếc, cửa hàng tạm hết sản phẩm thuộc danh mục ${matchedCategory.name}.`
            : 'Cửa hàng chưa có sản phẩm phù hợp với yêu cầu của bạn, bạn có thể tham khảo các danh mục khác nhé.'
        } else {
          suggestedProducts = products.map((p) => ({
            name: p.name,
            price: p.price,
            productId: p._id,
            url: `/${generateNameId({
              name: p.name,
              id: p._id.toString(),
            })}`,
          }))
          const productList = suggestedProducts
            .map((p) => `- ${p.name} (${p.price.toLocaleString()}đ)`)
            .join('\n')
          const dataPrompt = `Dưới đây là danh sách sản phẩm phù hợp với yêu cầu của khách hàng:\n${productList}\nChỉ được phép trả lời dựa trên danh sách trên, không được bịa thêm. Câu hỏi của khách: "${prompt}"\nHãy trả lời một cách tự nhiên bằng tiếng Việt.`
          reply = await sendPromptAI(dataPrompt, aiHistory)
        }
      } catch (err) {
        console.error('Lỗi suggest_product:', err)
        reply = 'Xin lỗi, tôi đang gặp chút sự cố khi tìm sản phẩm.'
      }

      await appendMessageToContext({
        userId,
        sessionId,
        message: { role: 'user', content: prompt, timestamp: new Date() },
        lastIntent: intent,
      })
      await appendMessageToContext({
        userId,
        sessionId,
        message: {
          role: 'assistant',
          content: reply,
          suggestedProducts,
          timestamp: new Date(),
        },
        lastIntent: intent,
      })
      if (newSessionIdCreated) {
        res.cookie('sessionId', sessionId, { httpOnly: true })
      }
      return res.json({
        reply,
        intent,
        sessionId,
        suggestedProducts,
        user: req.user,
      })
    }

    default:
      reply = await sendPromptAI(geminiPrompt, aiHistory)
      await appendMessageToContext({
        userId,
        sessionId,
        message: { role: 'user', content: prompt, timestamp: new Date() },
        lastIntent: intent,
      })
      await appendMessageToContext({
        userId,
        sessionId,
        message: { role: 'assistant', content: reply, timestamp: new Date() },
        lastIntent: intent,
      })
      if (newSessionIdCreated) {
        res.cookie('sessionId', sessionId, { httpOnly: true })
      }
      return res.json({ reply, intent, sessionId, user: req.user })
  }

  // Fallback for intents not returning immediately
  await appendMessageToContext({
    userId,
    sessionId,
    message: { role: 'user', content: prompt, timestamp: new Date() },
    lastIntent: intent,
  })
  await appendMessageToContext({
    userId,
    sessionId,
    message: { role: 'assistant', content: reply, timestamp: new Date() },
    lastIntent: intent,
  })
  if (newSessionIdCreated) {
    res.cookie('sessionId', sessionId, { httpOnly: true })
  }
  return res.json({ reply, intent, sessionId, user: req.user })
}

const getChatHistory = async (req: Request, res: Response) => {
  const userId = req.user?._id.toString()
  const sessionId =
    (req.headers['x-session-id'] as string) || req.cookies?.sessionId

  // Nếu không có userId và sessionId, đây là lần đầu tiên, trả về mảng rỗng
  if (!userId && !sessionId) {
    return res.json({ history: [], sessionId: null })
  }

  const context: IChatContext | null = await getContext({ userId, sessionId })
  const history = context?.messages || []

  return res.json({ history, sessionId })
}

const chatbotController = {
  handleChatPrompt,
  getChatHistory
}

export default chatbotController 