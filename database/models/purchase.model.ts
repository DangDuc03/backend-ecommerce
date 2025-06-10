import { Schema, model, Document, Types } from 'mongoose'
import { STATUS_PURCHASE } from '../../constants/purchase'
import { IUser } from './user.model'
import { IProduct } from './product.model'
import { IOrder } from './order.model'

export interface IPurchase extends Document {
  _id: string
  user: Types.ObjectId | IUser
  product: Types.ObjectId | IProduct
  buy_count: number
  price: number
  price_before_discount: number
  status: number
  order?: Types.ObjectId | IOrder
  createdAt: Date
  updatedAt: Date
}

export interface IPurchasePopulated extends Omit<IPurchase, 'product' | 'user' | 'order'> {
  product: IProduct
  user: IUser
  order?: IOrder
}

const purchaseSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'users',
      required: true,
    },
    product: {
      type: Schema.Types.ObjectId,
      ref: 'products',
      required: true,
    },
    buy_count: {
      type: Number,
      required: true,
      default: 0,
    },
    price: {
      type: Number,
      required: true,
      default: 0,
    },
    price_before_discount: {
      type: Number,
      required: true,
      default: 0,
    },
    status: {
      type: Number,
      default: STATUS_PURCHASE.WAIT_FOR_CONFIRMATION,
    },
    order: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
)

export const PurchaseModel = model<IPurchase>('purchases', purchaseSchema)
