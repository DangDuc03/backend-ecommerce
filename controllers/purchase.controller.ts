import { Request, Response, NextFunction } from 'express'
import { STATUS_PURCHASE } from '../constants/purchase'
import { STATUS } from '../constants/status'
import { IProduct, ProductModel } from '../database/models/product.model'
import {
  IPurchase,
  IPurchasePopulated,
  PurchaseModel,
} from '../database/models/purchase.model'
import { ErrorHandler, responseSuccess } from '../utils/response'
import { handleImageProduct } from './product.controller'
import { cloneDeep } from 'lodash'
import OrderModel, { IOrder } from '../database/models/order.model'
import { IUser, UserModel } from '../database/models/user.model'
import mongoose from 'mongoose'

declare global {
  namespace Express {
    interface Request {
      user?: IUser
    }
  }
}

export const addToCart = async (req: Request, res: Response) => {
  const { product_id, buy_count } = req.body
  const product = await ProductModel.findById(product_id).lean<IProduct>()
  if (product) {
    if (buy_count > product.quantity) {
      throw new ErrorHandler(
        STATUS.NOT_ACCEPTABLE,
        'Số lượng vượt quá số lượng sản phẩm'
      )
    }
    const purchaseInDb = await PurchaseModel.findOne({
      user: req.user._id,
      status: STATUS_PURCHASE.IN_CART,
      product: product_id,
    })

    let data: IPurchasePopulated
    if (purchaseInDb) {
      data = await PurchaseModel.findByIdAndUpdate(
        purchaseInDb._id,
        {
          buy_count: purchaseInDb.buy_count + buy_count,
        },
        { new: true }
      )
        .populate('product')
        .lean<IPurchasePopulated>()
    } else {
      const newPurchase = await new PurchaseModel({
        user: req.user._id,
        product: product._id,
        buy_count: buy_count,
        price: product.price,
        price_before_discount: product.price_before_discount,
        status: STATUS_PURCHASE.IN_CART,
      }).save()
      data = await PurchaseModel.findById(newPurchase._id)
        .populate('products')
        .lean<IPurchasePopulated>()
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
  const purchaseInDb = await PurchaseModel.findOne({
    user: req.user._id,
    status: STATUS_PURCHASE.IN_CART,
    product: product_id,
  })
    .populate('product')
    .lean<IPurchasePopulated>()
  if (purchaseInDb) {
    if (buy_count > purchaseInDb.product.quantity) {
      throw new ErrorHandler(
        STATUS.NOT_ACCEPTABLE,
        'Số lượng vượt quá số lượng sản phẩm'
      )
    }
    const data = await PurchaseModel.findByIdAndUpdate(
      purchaseInDb._id,
      { buy_count },
      { new: true }
    )
      .populate('product')
      .lean<IPurchasePopulated>()
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
  const userProfile = req.user
  if (!userProfile || !userProfile.name || !userProfile.phone || !userProfile.address) {
    throw new ErrorHandler(
      STATUS.NOT_ACCEPTABLE,
      'Bạn cần cập nhật đầy đủ họ tên, số điện thoại và địa chỉ trước khi mua hàng.'
    )
  }

  const purchasesToBuy: IPurchasePopulated[] = []
  for (const item of req.body) {
    const product = await ProductModel.findById(item.product_id).lean<IProduct>()
    if (product) {
      if (item.buy_count > product.quantity) {
        throw new ErrorHandler(STATUS.NOT_ACCEPTABLE, `Số lượng mua sản phẩm ${product.name} vượt quá số lượng tồn kho.`)
      }

      let data = await PurchaseModel.findOneAndUpdate(
        {
          user: userProfile._id,
          status: STATUS_PURCHASE.IN_CART,
          product: item.product_id,
        },
        {
          buy_count: item.buy_count,
          status: STATUS_PURCHASE.WAIT_FOR_CONFIRMATION,
        },
        { new: true }
      ).populate('product').lean<IPurchasePopulated>()

      if (!data) {
        const newPurchase = await new PurchaseModel({
          user: userProfile._id,
          product: item.product_id,
          buy_count: item.buy_count,
          price: product.price,
          price_before_discount: product.price_before_discount,
          status: STATUS_PURCHASE.WAIT_FOR_CONFIRMATION,
        }).save()
        data = await PurchaseModel.findById(newPurchase._id).populate('product').lean<IPurchasePopulated>()
      }
      purchasesToBuy.push(data)
      const newQuantity = product.quantity - item.buy_count
      await ProductModel.findByIdAndUpdate(item.product_id, {
        quantity: newQuantity < 0 ? 0 : newQuantity,
        $inc: { sold: item.buy_count },
      })
    } else {
      throw new ErrorHandler(STATUS.NOT_FOUND, `Không tìm thấy sản phẩm với id ${item.product_id}`)
    }
  }

  if (purchasesToBuy.length > 0) {
    const purchaseIds = purchasesToBuy.map((item) => item._id)
    const newOrder = await OrderModel.create({
      userId: userProfile._id,
      userName: userProfile.name,
      items: purchasesToBuy.map((item) => ({
        productId: item.product._id,
        name: item.product.name,
        price: item.price,
        quantity: item.buy_count,
      })),
      total: purchasesToBuy.reduce((sum, item) => sum + item.price * item.buy_count, 0),
      status: STATUS_PURCHASE.WAIT_FOR_CONFIRMATION,
      purchaseIds,
    })
    
    // Link the order to the purchases
    await PurchaseModel.updateMany({ _id: { $in: purchaseIds } }, { order: newOrder._id })
  }

  const response = {
    message: 'Mua thành công',
    data: purchasesToBuy,
  }
  return responseSuccess(res, response)
}

export const getPurchases = async (req: Request, res: Response) => {
  const { status = STATUS_PURCHASE.ALL } = req.query
  const condition: any = {
    user: req.user._id,
  }
  if (Number(status) !== STATUS_PURCHASE.ALL) {
    condition.status = status
  } else {
    condition.status = { $ne: STATUS_PURCHASE.ALL }
  }

  const purchases = await PurchaseModel.find(condition)
    .populate({
      path: 'product',
    })
    .populate({
      path: 'order',
    })
    .sort({
      createdAt: -1,
    })
    .lean<IPurchasePopulated[]>()

  const response = {
    message: `Lấy danh sách đơn mua thành công`,
    data: purchases,
  }
  return responseSuccess(res, response)
}

export const deletePurchases = async (req: Request, res: Response) => {
  const purchase_ids = req.body
  const user_id = req.user._id
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

export const cancelOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user._id
    const { orderId } = req.params

    const order = await OrderModel.findOne({ _id: orderId, userId }).lean()
    if (!order) {
      throw new ErrorHandler(STATUS.NOT_FOUND, 'Không tìm thấy đơn hàng.')
    }
    if (order.status !== STATUS_PURCHASE.WAIT_FOR_CONFIRMATION) {
      throw new ErrorHandler(STATUS.BAD_REQUEST, 'Chỉ có thể huỷ đơn hàng ở trạng thái chờ xác nhận.')
    }

    // Restore product quantities first
    if (order.items && order.items.length > 0) {
      for (const item of order.items) {
        await ProductModel.findByIdAndUpdate(item.productId, {
          $inc: { quantity: item.quantity, sold: -item.quantity },
        })
      }
    }

    // Then, update the status for the order and associated purchases
    await OrderModel.updateOne({ _id: orderId, userId }, { status: STATUS_PURCHASE.CANCELLED })
    if (order.purchaseIds && order.purchaseIds.length > 0) {
      await PurchaseModel.updateMany({ _id: { $in: order.purchaseIds } }, { status: STATUS_PURCHASE.CANCELLED })
    }

    return responseSuccess(res, { message: 'Huỷ đơn hàng thành công.' })
  } catch (error) {
    next(error)
  }
}
