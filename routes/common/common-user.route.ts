import { Router } from 'express'
import authMiddleware from '../../middleware/auth.middleware'
import userController from '../../controllers/user.controller'
import { wrapAsync } from '../../utils/response'
import userMiddleware from '../../middleware/user.middleware'
import helpersMiddleware from '../../middleware/helpers.middleware'
import express from 'express'
import { sendPromptAI, detectIntentAI, extractProductNameAI } from '../../utils/ai.service'
import { getContext, appendMessageToContext } from '../../utils/chatContext.service'
import { v4 as uuidv4 } from 'uuid'
import { ProductModel } from '../../database/models/product.model'
import { CLIENT_RENEG_LIMIT } from 'node:tls'
import OrderModel from '../../models/order.model'
import { CategoryModel } from '../../database/models/category.model'
import { PurchaseModel } from '../../database/models/purchase.model'
import { STATUS_PURCHASE } from '../../constants/purchase'
import { getRecentHistory, buildChatPrompt, mapCartFromPurchases, HISTORY_LIMIT } from '../../utils/chatbot.utils'

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

commonUserRouter.put(
  '/:user_id/status',
  authMiddleware.verifyAccessToken,
  helpersMiddleware.idValidator,
  wrapAsync(userController.updateOnlineStatus)
)

commonUserRouter.post(
  '/chatbot',
  authMiddleware.verifyAccessToken,
  async (req, res) => {
    const { prompt } = req.body
    // Lấy userId từ token đã giải mã
    let userId = (req as any).user?._id || (req as any).jwtDecoded?.id
    let sessionId = req.headers['x-session-id'] || req.cookies?.sessionId
    if (!userId && !sessionId) {
      sessionId = uuidv4()
      res.cookie && res.cookie('sessionId', sessionId, { httpOnly: true })
    }
    if (!prompt) {
      return res.status(400).json({ message: 'Prompt is required' })
    }
    const intent = await detectIntentAI(prompt)
    const context = await getContext({ userId, sessionId })
    const aiHistory = getRecentHistory(context)
    const geminiPrompt = buildChatPrompt(aiHistory, prompt)

    let reply = ''
    // Các intent thao tác yêu cầu đăng nhập
    if (['add_to_cart', 'view_cart', 'order'].includes(intent) && !userId) {
      return res.status(401).json({ message: 'Bạn cần đăng nhập để sử dụng tính năng này.' })
    }
    // Nếu intent là add_to_cart
    if (intent === 'add_to_cart') {
      // Lưu message user vào context trước khi xử lý
      await appendMessageToContext({
        userId,
        sessionId,
        message: { role: 'user', content: prompt, timestamp: new Date() },
        lastIntent: intent
      })
      // 1. Dùng AI trích xuất tên sản phẩm và số lượng (nếu có)
      const extractPrompt = `Hãy trích xuất tên sản phẩm và số lượng từ câu sau (trả về đúng định dạng: <tên sản phẩm>|<số lượng>, nếu không có số lượng thì mặc định là 1, không giải thích):\n${prompt}`;
      const extractResult = await sendPromptAI(extractPrompt, aiHistory);
      // Ví dụ: "Điện Thoại Vsmart Active 3|3"
      const [extractedName, quantityStr] = extractResult.split('|').map(s => s.trim());
      const quantity = parseInt(quantityStr, 10) || 1;
      // 2. Tìm sản phẩm gần đúng trong DB
      const product = await ProductModel.findOne({ name: { $regex: extractedName, $options: 'i' } }).lean() as any
      if (!product) {
        reply = `Xin lỗi, cửa hàng không tìm thấy sản phẩm "${extractedName}" để thêm vào giỏ hàng.`
        await appendMessageToContext({
          userId,
          sessionId,
          message: { role: 'assistant', content: reply, timestamp: new Date() },
          lastIntent: intent
        })
        return res.json({ reply, intent, sessionId })
      } else {
        // 3. Thêm vào giỏ hàng thực tế (purchase DB)
        // Kiểm tra đã có purchase chưa
        let purchase = await PurchaseModel.findOne({
          user: userId,
          status: STATUS_PURCHASE.IN_CART,
          product: product._id
        })
        if (purchase) {
          (purchase as any).buy_count += quantity
          await (purchase as any).save()
        } else {
          purchase = await PurchaseModel.create({
            user: userId,
            product: product._id,
            buy_count: quantity,
            price: product.price,
            price_before_discount: product.price_before_discount,
            status: STATUS_PURCHASE.IN_CART
          })
        }
        // 4. Thêm vào context (giữ lại logic cũ nếu muốn đồng bộ chat)
        let cart = context?.cart || []
        const existIdx = cart.findIndex((item: any) => item._id?.toString() === product._id?.toString())
        if (existIdx > -1) {
          cart[existIdx].quantity += quantity
        } else {
          cart.push({ _id: product._id, name: product.name, price: product.price, quantity })
        }
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
    // Nếu intent là search_product hoặc info
    else if (intent === 'search_product' || intent === 'info') {
      try {
        // Lấy danh sách danh mục
        const categories = await CategoryModel.find({}).lean();
        if (!categories.length) {
          reply = 'Hiện tại cửa hàng chưa có danh mục sản phẩm nào.';
          return res.json({ reply, intent, sessionId });
        }
        const categoryList = categories.map((c: any) => `- ${c.name}`).join('\n');
        // Kiểm tra prompt có nhắc đến danh mục cụ thể không
        const mentionedCategory = categories.find((c: any) => prompt.toLowerCase().includes((c.name || '').toLowerCase()));
        if (!mentionedCategory) {
          // Nếu không nhắc đến danh mục cụ thể, trả về danh mục
          const dataPrompt = `Dưới đây là các danh mục sản phẩm shop đang kinh doanh:\n${categoryList}\nBạn chỉ được phép trả lời dựa trên danh sách danh mục trên, không được bịa thêm. Nếu khách hỏi về sản phẩm cụ thể, hãy hướng dẫn khách chọn danh mục trước.\nCâu hỏi của khách: "${prompt}"\nHãy trả lời bằng tiếng Việt.`;
          reply = await sendPromptAI(dataPrompt, aiHistory);
        } else {
          // Nếu có nhắc đến danh mục, trả về sản phẩm thuộc danh mục đó
          const products = await ProductModel.find({ category: mentionedCategory._id }).lean();
          if (!products.length) {
            reply = `Hiện tại cửa hàng chưa có sản phẩm nào trong danh mục ${(mentionedCategory as any).name}.`;
          } else {
            const productList = products.map((p: any) => `- ${p.name} (${p.price.toLocaleString()}đ)`).join('\n');
            const dataPrompt = `Dưới đây là các sản phẩm thuộc danh mục ${(mentionedCategory as any).name}:\n${productList}\nChỉ được phép trả lời dựa trên danh sách trên, không được bịa thêm. Câu hỏi của khách: "${prompt}"\nHãy trả lời bằng tiếng Việt.`;
            reply = await sendPromptAI(dataPrompt, aiHistory);
          }
        }
        return res.json({ reply, intent, sessionId });
      } catch (err) {
        console.error('Lỗi khi query danh mục/sản phẩm:', err);
        return res.status(500).json({ message: 'Có lỗi khi truy vấn danh mục hoặc sản phẩm.' });
      }
    }
    // Nếu intent là view_cart
    else if (intent === 'view_cart') {
      // Lấy purchases từ DB
      const purchases = await PurchaseModel.find({
        user: userId,
        status: STATUS_PURCHASE.IN_CART
      }).populate('product').lean();
      let orders = [];
      if (!purchases.length) {
        reply = 'Giỏ hàng của bạn hiện đang trống.';
      } else {
        // const cartList = mapCartFromPurchases(purchases)
        // reply = `Giỏ hàng của bạn gồm:\n${cartList}`;
        // Rút gọn reply, không liệt kê chi tiết sản phẩm
        reply = `Giỏ hàng của bạn gồm ${purchases.length} sản phẩm như sau:`;
        orders = purchases.map((item: any) => ({
          product_id: item.product?._id?.toString() || '',
          name: item.product?.name || '',
          image: item.product?.image || '',
          price: item.price,
          quantity: item.buy_count,
          status: 'Trong giỏ hàng',
          product_url: item.product?.name && item.product?._id ? `${generateNameId({ name: item.product.name, id: item.product._id })}` : ''
        }));
      }
      // Lưu lại hội thoại
      await appendMessageToContext({
        userId,
        sessionId,
        message: { role: 'user', content: prompt, timestamp: new Date() },
        lastIntent: intent
      });
      await appendMessageToContext({
        userId,
        sessionId,
        message: { role: 'assistant', content: reply, orders, timestamp: new Date() },
        lastIntent: intent
      });
      return res.json({ reply, intent, sessionId, orders });
    }
    // Nếu intent là check_order_status
    else if (intent === 'check_order_status') {
      try {
        // Trích xuất mã đơn hàng từ prompt (24 ký tự hex)
        const orderIdMatch = prompt.match(/[a-f0-9]{24}/);
        if (orderIdMatch) {
          const orderId = orderIdMatch[0];
          const order = await OrderModel.findOne({ _id: orderId, userId }).lean();
          if (!order) {
            reply = `Không tìm thấy đơn hàng với mã ${orderId}.`;
          } else {
            const statusVi = ORDER_STATUS_VI[order.status] || order.status;
            reply = `Trạng thái đơn hàng ${orderId}: ${statusVi}. Tổng tiền: ${order.total.toLocaleString()}đ.`;
          }
          await appendMessageToContext({ userId, sessionId, message: { role: 'user', content: prompt, timestamp: new Date() }, lastIntent: intent });
          await appendMessageToContext({ userId, sessionId, message: { role: 'assistant', content: reply, timestamp: new Date() }, lastIntent: intent });
          return res.json({ reply, intent, sessionId });
        }
        // Nếu không có mã đơn hàng, dùng AI trích xuất tên sản phẩm
        const extractPrompt = `Hãy trích xuất tên sản phẩm từ câu sau (chỉ trả về tên, không giải thích):\n${prompt}`;
        const productName = (await sendPromptAI(extractPrompt, aiHistory)).trim();
        // Các từ khoá loại trừ và trạng thái
        const ignoreKeywords = [
          'lịch sử đơn hàng', 'trạng thái đơn hàng', 'đơn hàng', 'order', 'orders', 'kiểm tra đơn hàng', 'xem đơn hàng'
        ];
        const cancelKeywords = [
          'đã huỷ', 'đơn hàng bị huỷ', 'đơn bị huỷ', 'canceled', 'cancelled', 'đơn huỷ'
        ];
        const statusKeywords = [
          { key: 'đã giao', status: STATUS_PURCHASE.DELIVERED },
          { key: 'chờ xác nhận', status: STATUS_PURCHASE.WAIT_FOR_CONFIRMATION },
          { key: 'chờ lấy hàng', status: STATUS_PURCHASE.WAIT_FOR_GETTING },
          { key: 'đang giao', status: STATUS_PURCHASE.IN_PROGRESS },
          { key: 'cancelled', status: STATUS_PURCHASE.CANCELLED },
        ];
        const lowerPrompt = prompt.toLowerCase();
        const isCancelQuery = cancelKeywords.some(keyword => lowerPrompt.includes(keyword));
        const foundStatus = statusKeywords.find(s => lowerPrompt.includes(s.key));
        // Nếu không có tên sản phẩm hoặc tên sản phẩm là các từ khoá loại trừ
        if (
          !productName ||
          ignoreKeywords.some(keyword => productName.toLowerCase().includes(keyword)) ||
          productName.length < 2
        ) {
          let ordersRaw;
          if (isCancelQuery) {
            // Trả về 3 đơn đã huỷ gần nhất
            ordersRaw = await OrderModel.find({ userId, status: STATUS_PURCHASE.CANCELLED }).sort({ createdAt: -1 }).limit(3).lean();
            if (!ordersRaw.length) {
              reply = 'Bạn chưa có đơn hàng nào bị huỷ.';
            } else {
              reply = `Đây là ${ordersRaw.length} đơn hàng bị huỷ gần nhất của bạn:\n` +
                ordersRaw.map(o => `- Mã: ${o._id}, tổng: ${o.total.toLocaleString()}đ`).join('\n');
            }
          } else if (foundStatus) {
            // Trả về 2 đơn gần nhất theo trạng thái cụ thể
            ordersRaw = await OrderModel.find({ userId, status: foundStatus.status }).sort({ createdAt: -1 }).limit(2).lean();
            if (!ordersRaw.length) {
              reply = `Bạn chưa có đơn hàng nào với trạng thái "${foundStatus.key}".`;
            } else {
              reply = `Đây là ${ordersRaw.length} đơn hàng trạng thái "${foundStatus.key}" gần nhất của bạn:\n` +
                ordersRaw.map(o => `- Mã: ${o._id}, tổng: ${o.total.toLocaleString()}đ`).join('\n');
            }
          } else {
            // Trả về 2 đơn gần nhất KHÔNG bị huỷ
            ordersRaw = await OrderModel.find({ userId, status: { $ne: STATUS_PURCHASE.CANCELLED } }).sort({ createdAt: -1 }).limit(2).lean();
            if (!ordersRaw.length) {
              reply = 'Bạn chưa có đơn hàng nào.';
            } else {
              reply = `Đây là ${ordersRaw.length} đơn hàng gần nhất của bạn:\n` +
                ordersRaw.map(o => `- Mã: ${o._id}, trạng thái: ${ORDER_STATUS_VI[o.status]}, tổng: ${o.total.toLocaleString()}đ`).join('\n');
            }
          }
          await appendMessageToContext({ userId, sessionId, message: { role: 'user', content: prompt, timestamp: new Date() }, lastIntent: intent });
          await appendMessageToContext({ userId, sessionId, message: { role: 'assistant', content: reply, timestamp: new Date() }, lastIntent: intent });
          return res.json({ reply, intent, sessionId });
        }
        // Nếu có tên sản phẩm, tìm đơn hàng chứa sản phẩm đó như cũ
        const ordersRaw = await OrderModel.find({
          userId,
          'items.name': { $regex: productName, $options: 'i' }
        }).lean();
        if (!ordersRaw.length) {
          reply = `Không tìm thấy đơn hàng nào chứa sản phẩm "${productName}".`;
        } else if (ordersRaw.length === 1) {
          const order = ordersRaw[0];
          const statusVi = ORDER_STATUS_VI[order.status] || order.status;
          reply = `Đơn hàng ${order._id} chứa sản phẩm "${productName}" có trạng thái: ${statusVi}. Tổng tiền: ${order.total.toLocaleString()}đ.`;
        } else {
          reply = `Tìm thấy ${ordersRaw.length} đơn hàng chứa sản phẩm "${productName}":\n` +
            ordersRaw.map(o => `- Mã: ${o._id}, trạng thái: ${ORDER_STATUS_VI[o.status]}, tổng: ${o.total.toLocaleString()}đ`).join('\n');
        }
        await appendMessageToContext({ userId, sessionId, message: { role: 'user', content: prompt, timestamp: new Date() }, lastIntent: intent });
        await appendMessageToContext({ userId, sessionId, message: { role: 'assistant', content: reply, timestamp: new Date() }, lastIntent: intent });
        return res.json({ reply, intent, sessionId });
      } catch (err) {
        console.error('Lỗi check_order_status:', err);
        return res.status(500).json({ message: 'Xin lỗi, có lỗi xảy ra. Vui lòng thử lại sau.' });
      }
    }
    // Nếu intent là order
    else if (intent === 'order') {
      try {
        let purchases: any[] = [];
        // Dùng AI trích xuất tên sản phẩm hoặc xác định "tất cả" hoặc nhiều sản phẩm
        const extractPrompt = `Hãy trích xuất tên sản phẩm và số lượng muốn thanh toán từ câu sau.\n- Nếu ý định là thanh toán toàn bộ giỏ hàng, trả về: tất cả|số lượng (nếu có, nếu không có thì để trống).\n- Nếu không có tên sản phẩm, trả về rỗng.\n- Nếu có nhiều sản phẩm, trả về danh sách <tên sản phẩm>|<số lượng> cách nhau bởi dấu phẩy.\n- Không giải thích, chỉ trả về đúng định dạng.\nCâu: ${prompt}`;
        const extractResult = (await sendPromptAI(extractPrompt, aiHistory)).trim().toLowerCase();
        // Xử lý kết quả AI trả về
        if (!extractResult || extractResult === 'rỗng' || extractResult === 'rong') {
          reply = 'Bạn muốn thanh toán toàn bộ giỏ hàng hay chỉ một số sản phẩm? Vui lòng nhập tên sản phẩm hoặc chọn "tất cả".';
          await appendMessageToContext({ userId, sessionId, message: { role: 'user', content: prompt, timestamp: new Date() }, lastIntent: intent });
          await appendMessageToContext({ userId, sessionId, message: { role: 'assistant', content: reply, timestamp: new Date() }, lastIntent: intent });
          return res.json({ reply, intent, sessionId });
        }
        // Nếu AI trả về "tất cả"
        if (/^tất\s*cả(\|\d+)?$/.test(extractResult) || /tat\s*ca/.test(extractResult) || /all/.test(extractResult)) {
          purchases = await PurchaseModel.find({ user: userId, status: STATUS_PURCHASE.IN_CART }).populate('product').lean();
        } else if (extractResult.includes(',')) {
          // Nếu có nhiều sản phẩm, tách và xử lý từng sản phẩm
          const productEntries = extractResult.split(',').map(s => s.trim()).filter(Boolean);
          let allPurchases: any[] = [];
          for (const entry of productEntries) {
            const [name] = entry.split('|').map(s => s.trim());
            const product = await ProductModel.findOne({ name: { $regex: name, $options: 'i' } }).lean();
            if (product) {
              const purchase = await PurchaseModel.findOne({
                user: userId,
                status: STATUS_PURCHASE.IN_CART,
                product: product._id
              }).populate('product').lean();
              if (purchase) {
                allPurchases.push(purchase);
              }
            }
          }
          purchases = allPurchases;
        } else {
          // Nếu có tên sản phẩm, chỉ thanh toán sản phẩm đó
          const [productName] = extractResult.split('|').map(s => s.trim());
          const product = await ProductModel.findOne({ name: { $regex: productName, $options: 'i' } }).lean();
          if (!product) {
            reply = `Không tìm thấy sản phẩm "${productName}" trong giỏ hàng.`;
            await appendMessageToContext({ userId, sessionId, message: { role: 'user', content: prompt, timestamp: new Date() }, lastIntent: intent });
            await appendMessageToContext({ userId, sessionId, message: { role: 'assistant', content: reply, timestamp: new Date() }, lastIntent: intent });
            return res.json({ reply, intent, sessionId });
          }
          purchases = await PurchaseModel.find({
            user: userId,
            status: STATUS_PURCHASE.IN_CART,
            product: product._id
          }).populate('product').lean();
        }
        if (!purchases || !purchases.length) {
          reply = 'Giỏ hàng của bạn không có sản phẩm nào phù hợp để thanh toán.';
          await appendMessageToContext({ userId, sessionId, message: { role: 'user', content: prompt, timestamp: new Date() }, lastIntent: intent });
          await appendMessageToContext({ userId, sessionId, message: { role: 'assistant', content: reply, timestamp: new Date() }, lastIntent: intent });
          return res.json({ reply, intent, sessionId });
        }
        // Tạo đơn hàng thật trong DB, lưu purchaseIds
        const purchaseIds = purchases.map((item: any) => item._id);
        const total = purchases.reduce((sum: number, item: any) => sum + item.price * item.buy_count, 0);
        const orderDoc = await OrderModel.create({
          userId,
          items: purchases.map((item: any) => ({
            productId: item.product._id,
            name: item.product.name,
            price: item.price,
            quantity: item.buy_count
          })),
          total,
          status: STATUS_PURCHASE.WAIT_FOR_CONFIRMATION,
          purchaseIds
        });
        // Chuyển purchases sang trạng thái chờ xác nhận
        await PurchaseModel.updateMany({
          _id: { $in: purchaseIds },
          user: userId,
          status: STATUS_PURCHASE.IN_CART
        }, { status: STATUS_PURCHASE.WAIT_FOR_CONFIRMATION });
        const orderInfo = mapCartFromPurchases(purchases)
        reply = `Đơn hàng của bạn đã được ghi nhận với các sản phẩm sau:\n${orderInfo}\nTổng tiền: ${total.toLocaleString()}đ.\nMã đơn hàng: ${orderDoc._id}\nCảm ơn bạn đã đặt hàng!`;
        // Xóa giỏ hàng trong context
        await appendMessageToContext({ userId, sessionId, message: { role: 'user', content: prompt, timestamp: new Date() }, lastIntent: intent, cart: [] });
        await appendMessageToContext({ userId, sessionId, message: { role: 'assistant', content: reply, timestamp: new Date() }, lastIntent: intent, cart: [] });
        return res.json({ reply, intent, sessionId, order: orderDoc });
      } catch (err) {
        console.error('Lỗi order:', err);
        return res.status(500).json({ message: 'Xin lỗi, có lỗi xảy ra. Vui lòng thử lại sau.' });
      }
    }
    // Hủy đơn hàng
    else if (intent === 'cancel_order') {
      const orderIdMatch = prompt.match(/[a-f0-9]{24}/);
      if (!orderIdMatch) {
        reply = 'Bạn vui lòng cung cấp mã đơn hàng hợp lệ (24 ký tự) để hủy.';
        await appendMessageToContext({ userId, sessionId, message: { role: 'user', content: prompt, timestamp: new Date() }, lastIntent: intent });
        await appendMessageToContext({ userId, sessionId, message: { role: 'assistant', content: reply, timestamp: new Date() }, lastIntent: intent });
        return res.json({ reply, intent, sessionId });
      }
      const orderId = orderIdMatch[0];
      const order = await OrderModel.findOne({ _id: orderId, userId }).lean();
      if (!order) {
        reply = `Không tìm thấy đơn hàng với mã ${orderId}.`;
      } else if (order.status !== STATUS_PURCHASE.WAIT_FOR_CONFIRMATION) {
        reply = `Đơn hàng ${orderId} không thể hủy vì đã chuyển sang trạng thái: ${ORDER_STATUS_VI[order.status]}.`;
      } else {
        // 1. Cập nhật trạng thái đơn hàng
        await OrderModel.updateOne({ _id: orderId, userId }, { status: STATUS_PURCHASE.CANCELLED });
        // 2. Chỉ cập nhật purchases liên quan đến đơn hàng này
        if (order.purchaseIds && order.purchaseIds.length > 0) {
          await PurchaseModel.updateMany(
            {
              _id: { $in: order.purchaseIds },
              user: userId,
              status: STATUS_PURCHASE.WAIT_FOR_CONFIRMATION
            },
            { status: STATUS_PURCHASE.CANCELLED }
          );
        }
        reply = `Đơn hàng ${orderId} đã được hủy thành công.`;
      }
      await appendMessageToContext({ userId, sessionId, message: { role: 'user', content: prompt, timestamp: new Date() }, lastIntent: intent });
      await appendMessageToContext({ userId, sessionId, message: { role: 'assistant', content: reply, timestamp: new Date() }, lastIntent: intent });
      return res.json({ reply, intent, sessionId });
    }
    // Thay đổi số lượng sản phẩm trong giỏ hàng
    else if (intent === 'change_cart_quantity') {
      // 1. Dùng AI trích xuất tên sản phẩm và số lượng mới
      const extractPrompt = `Hãy trích xuất tên sản phẩm và số lượng mới từ câu sau (trả về đúng định dạng: <tên sản phẩm>|<số lượng>, không giải thích):\n${prompt}`;
      const extractResult = await sendPromptAI(extractPrompt, aiHistory);
      // Ví dụ: "Điện Thoại Vsmart Active 3|3"
      const [productName, quantityStr] = extractResult.split('|').map(s => s.trim());
      const quantity = parseInt(quantityStr, 10);

      if (!productName || !quantity || isNaN(quantity) || quantity < 1) {
        reply = 'Không xác định được tên sản phẩm hoặc số lượng mới. Bạn vui lòng nhập lại rõ ràng hơn.';
        return res.json({ reply, intent, sessionId });
      }

      // 2. Tìm purchase trong DB
      const product = await ProductModel.findOne({ name: { $regex: productName, $options: 'i' } }).lean();
      if (!product) {
        reply = `Không tìm thấy sản phẩm "${productName}" trong hệ thống.`;
        return res.json({ reply, intent, sessionId });
      }
      const purchase = await PurchaseModel.findOne({
        user: userId,
        status: STATUS_PURCHASE.IN_CART,
        product: product._id
      });
      if (!purchase) {
        reply = `Sản phẩm "${productName}" không có trong giỏ hàng của bạn.`;
        return res.json({ reply, intent, sessionId });
      }

      // 3. Cập nhật số lượng
      (purchase as any).buy_count = quantity;
      await (purchase as any).save();

      reply = `Đã cập nhật số lượng "${productName}" trong giỏ hàng của bạn thành ${quantity} cái.`;
      await appendMessageToContext({ userId, sessionId, message: { role: 'user', content: prompt, timestamp: new Date() }, lastIntent: intent });
      await appendMessageToContext({ userId, sessionId, message: { role: 'assistant', content: reply, timestamp: new Date() }, lastIntent: intent });
      return res.json({ reply, intent, sessionId });
    }
    // Các intent khác
    else {
      reply = await sendPromptAI(geminiPrompt, aiHistory)
      // Lưu lại hội thoại
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
      return res.json({ reply, intent, sessionId })
    }
  }
)

// Lịch sử chat
commonUserRouter.get(
  '/chatbot/history',
  authMiddleware.verifyAccessToken,
  async (req, res) => {
    // Lấy userId từ token đã giải mã
    const userId = (req as any).user?._id || (req as any).jwtDecoded?.id
    if (!userId) {
      return res.status(401).json({ message: 'Bạn cần đăng nhập để xem lịch sử chat.' })
    }
    // Lấy context theo userId
    const context = await require('../../utils/chatContext.service').getContext({ userId })
    const history = context?.messages || []
    res.json({ history })
  }
)

// Map trạng thái số sang string cho OrderModel
const ORDER_STATUS_MAP: Record<number, number> = {
  [-1]: STATUS_PURCHASE.IN_CART,
  [0]: STATUS_PURCHASE.ALL,
  [1]: STATUS_PURCHASE.WAIT_FOR_CONFIRMATION,
  [2]: STATUS_PURCHASE.WAIT_FOR_GETTING,
  [3]: STATUS_PURCHASE.IN_PROGRESS,
  [4]: STATUS_PURCHASE.DELIVERED,
  [5]: STATUS_PURCHASE.CANCELLED,
}

// Map trạng thái đơn hàng sang tiếng Việt
const ORDER_STATUS_VI: Record<number, string> = {
  [-1]: 'Trong giỏ hàng',
  [0]: 'Tất cả',
  [1]: 'Chờ xác nhận',
  [2]: 'Chờ lấy hàng',
  [3]: 'Đang giao',
  [4]: 'Đã giao',
  [5]: 'Đã hủy',
}

// Thêm hàm tạo product_url đúng chuẩn FE
function generateNameId({ name, id }: { name: string; id: string }) {
  const removeSpecialCharacter = (str: string) =>
    str.replace(/!|@|%|\^|\*|\(|\)|\+|\=|\<|\>|\?|\/|,|\.|\:|\;|\'|\"|\&|\#|\[|\]|~|\$|_|`|-|\{|\}|\||\\/g, '')
  return removeSpecialCharacter(name).replace(/\s/g, '-') + `-i-${id}`
}

export default commonUserRouter