import { Request, Response } from 'express'
import { STATUS_PURCHASE } from '../constants/purchase'
import { STATUS } from '../constants/status'
import { ProductModel } from '../database/models/product.model'
import { PurchaseModel } from '../database/models/purchase.model'
import { ErrorHandler, responseSuccess } from '../utils/response'
import { handleImageProduct } from './product.controller'
import { cloneDeep } from 'lodash'
import OrderModel from '../models/order.model'
import { UserModel } from '../database/models/user.model'

export const addToCart = async (req: Request, res: Response) => {
  const { product_id, buy_count } = req.body
  const product: any = await ProductModel.findById(product_id).lean()
  if (product) {
    if (buy_count > product.quantity) {
      throw new ErrorHandler(
        STATUS.NOT_ACCEPTABLE,
        'Số lượng vượt quá số lượng sản phẩm'
      )
    }
    const purchaseInDb: any = await PurchaseModel.findOne({
      user: req.jwtDecoded.id,
      status: STATUS_PURCHASE.IN_CART,
      product: {
        _id: product_id,
      },
    }).populate({
      path: 'product',
      populate: {
        path: 'category',
      },
    })
    let data
    if (purchaseInDb) {
      data = await PurchaseModel.findOneAndUpdate(
        {
          user: req.jwtDecoded.id,
          status: STATUS_PURCHASE.IN_CART,
          product: {
            _id: product_id,
          },
        },
        {
          buy_count: purchaseInDb.buy_count + buy_count,
        },
        {
          new: true,
        }
      )
        .populate({
          path: 'product',
          populate: {
            path: 'category',
          },
        })
        .lean()
    } else {
      const purchase = {
        user: req.jwtDecoded.id,
        product: product._id,
        buy_count: buy_count,
        price: product.price,
        price_before_discount: product.price_before_discount,
        status: STATUS_PURCHASE.IN_CART,
      }
      const addedPurchase = await new PurchaseModel(purchase).save()
      data = await PurchaseModel.findById(addedPurchase._id).populate({
        path: 'product',
        populate: {
          path: 'category',
        },
      })
    }
    const response = {
      message: 'Thêm sản phẩm vào giỏ hàng thành công',
      data,
    }
    return responseSuccess(res, response)
  } else {
    throw new ErrorHandler(STATUS.NOT_FOUND, 'Không tìm thấy sản phẩm')
  }
}

export const updatePurchase = async (req: Request, res: Response) => {
  const { product_id, buy_count } = req.body
  const purchaseInDb: any = await PurchaseModel.findOne({
    user: req.jwtDecoded.id,
    status: STATUS_PURCHASE.IN_CART,
    product: {
      _id: product_id,
    },
  })
    .populate({
      path: 'product',
      populate: {
        path: 'category',
      },
    })
    .lean()
  if (purchaseInDb) {
    if (buy_count > purchaseInDb.product.quantity) {
      throw new ErrorHandler(
        STATUS.NOT_ACCEPTABLE,
        'Số lượng vượt quá số lượng sản phẩm'
      )
    }
    const data = await PurchaseModel.findOneAndUpdate(
      {
        user: req.jwtDecoded.id,
        status: STATUS_PURCHASE.IN_CART,
        product: {
          _id: product_id,
        },
      },
      {
        buy_count,
      },
      {
        new: true,
      }
    )
      .populate({
        path: 'product',
        populate: {
          path: 'category',
        },
      })
      .lean()
    const response = {
      message: 'Cập nhật đơn thành công',
      data,
    }
    return responseSuccess(res, response)
  } else {
    throw new ErrorHandler(STATUS.NOT_FOUND, 'Không tìm thấy đơn')
  }
}

export const buyProducts = async (req: Request, res: Response) => {
  // Kiểm tra profile khách hàng
  const userId = req.jwtDecoded.id
  const userProfile = await UserModel.findById(userId).lean()
  const userProfileAny = userProfile as any
  if (!userProfileAny || !userProfileAny.name || !userProfileAny.phone || !userProfileAny.address) {
    throw new ErrorHandler(STATUS.NOT_ACCEPTABLE, 'Bạn cần cập nhật đầy đủ họ tên, số điện thoại và địa chỉ trước khi mua hàng.')
  }
  const purchases = []
  for (const item of req.body) {
    const product: any = await ProductModel.findById(item.product_id).lean()
    if (product) {
      if (item.buy_count > product.quantity) {
        throw new ErrorHandler(
          STATUS.NOT_ACCEPTABLE,
          'Số lượng mua vượt quá số lượng sản phẩm'
        )
      } else {
        let data = await PurchaseModel.findOneAndUpdate(
          {
            user: userId,
            status: STATUS_PURCHASE.IN_CART,
            product: {
              _id: item.product_id,
            },
          },
          {
            buy_count: item.buy_count,
            status: STATUS_PURCHASE.WAIT_FOR_CONFIRMATION,
          },
          {
            new: true,
          }
        )
          .populate({
            path: 'product',
            populate: {
              path: 'category',
            },
          })
          .lean()
        if (!data) {
          const purchase = {
            user: userId,
            product: item.product_id,
            buy_count: item.buy_count,
            price: product.price,
            price_before_discount: product.price_before_discount,
            status: STATUS_PURCHASE.WAIT_FOR_CONFIRMATION,
          }
          const addedPurchase = await new PurchaseModel(purchase).save()
          data = await PurchaseModel.findById(addedPurchase._id).populate({
            path: 'product',
            populate: {
              path: 'category',
            },
          })
        }
        purchases.push(data)
        // Trừ số lượng sản phẩm trong kho
        const newQuantity = product.quantity - item.buy_count
        await ProductModel.findByIdAndUpdate(item.product_id, { quantity: newQuantity < 0 ? 0 : newQuantity })
        // Tăng số lượng đã bán
        await ProductModel.findByIdAndUpdate(item.product_id, { $inc: { sold: item.buy_count } })
      }
    } else {
      throw new ErrorHandler(STATUS.NOT_FOUND, 'Không tìm thấy sản phẩm')
    }
  }
  if (purchases.length > 0) {
    const items = purchases.map((item: any) => ({
      productId: item.product._id,
      name: item.product.name,
      price: item.price,
      quantity: item.buy_count
    }))
    const total = purchases.reduce((sum: number, item: any) => sum + item.price * item.buy_count, 0)
    const purchaseIds = purchases.map((item: any) => item._id)
    await OrderModel.create({
      userId,
      userName: userProfileAny.name,
      items,
      total,
      status: STATUS_PURCHASE.WAIT_FOR_CONFIRMATION,
      purchaseIds
    })
  }
  const response = {
    message: 'Mua thành công',
    data: purchases,
  }
  return responseSuccess(res, response)
}

export const getPurchases = async (req: Request, res: Response) => {
  const { status = STATUS_PURCHASE.ALL } = req.query
  const user_id = req.jwtDecoded.id
  let condition: any = {
    user: user_id,
    status: {
      $ne: STATUS_PURCHASE.ALL,
    },
  }
  if (Number(status) !== STATUS_PURCHASE.ALL) {
    condition.status = status
  }

  let purchases: any = await PurchaseModel.find(condition)
    .populate({
      path: 'product',
      populate: {
        path: 'category',
      },
    })
    .sort({
      createdAt: -1,
    })
    .lean()

  // Map orderId cho mỗi purchase
  const orders = await OrderModel.find({ userId: user_id }).lean()
  const purchaseIdToOrderId: Record<string, string> = {}
  orders.forEach(order => {
    if (order.purchaseIds && order.purchaseIds.length > 0) {
      order.purchaseIds.forEach(pid => {
        purchaseIdToOrderId[pid.toString()] = order._id.toString()
      })
    }
  })

  purchases = purchases.map((purchase) => {
    purchase.product = handleImageProduct(cloneDeep(purchase.product))
    purchase.orderId = purchaseIdToOrderId[purchase._id.toString()] || null
    return purchase
  })
  const response = {
    message: 'Lấy đơn mua thành công',
    data: purchases,
  }
  return responseSuccess(res, response)
}

export const deletePurchases = async (req: Request, res: Response) => {
  const purchase_ids = req.body
  const user_id = req.jwtDecoded.id
  const deletedData = await PurchaseModel.deleteMany({
    user: user_id,
    status: STATUS_PURCHASE.IN_CART,
    _id: { $in: purchase_ids },
  })
  return responseSuccess(res, {
    message: `Xoá ${deletedData.deletedCount} đơn thành công`,
    data: { deleted_count: deletedData.deletedCount },
  })
}

export const cancelOrder = async (req: Request, res: Response) => {
  try {
    const userId = req.jwtDecoded.id
    const { orderId } = req.params
    const order = await OrderModel.findOne({ _id: orderId, userId }).lean()
    if (!order) {
      throw new ErrorHandler(404, 'Không tìm thấy đơn hàng.')
    }
    if (order.status !== STATUS_PURCHASE.WAIT_FOR_CONFIRMATION) {
      throw new ErrorHandler(400, 'Chỉ có thể huỷ đơn hàng ở trạng thái chờ xác nhận.')
    }
    // Cập nhật status order
    await OrderModel.updateOne({ _id: orderId, userId }, { status: STATUS_PURCHASE.CANCELLED })
    // Cập nhật status purchases liên quan
    if (order.purchaseIds && order.purchaseIds.length > 0) {
      await PurchaseModel.updateMany(
        { _id: { $in: order.purchaseIds } },
        { status: STATUS_PURCHASE.CANCELLED }
      )
    }
    // Cộng lại số lượng vào kho và giảm số lượng đã bán
    if (order.items && order.items.length > 0) {
      for (const item of order.items) {
        await ProductModel.findByIdAndUpdate(item.productId, { $inc: { quantity: item.quantity, sold: -item.quantity } })
      }
    }
    return responseSuccess(res, { message: 'Huỷ đơn hàng thành công.' })
  } catch (error) {
    return responseSuccess(res, { message: 'Có lỗi xảy ra, vui lòng thử lại.' })
  }
}
