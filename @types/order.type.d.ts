import { Types } from 'mongoose'

interface OrderItem {
  productId: Types.ObjectId
  name: string
  price: number
  quantity: number
}

interface Order {
  _id?: Types.ObjectId
  userId: Types.ObjectId | string
  userName: string
  items: OrderItem[]
  total: number
  status: number
  purchaseIds: Types.ObjectId[]
  createdAt?: string
  updatedAt?: string
}

