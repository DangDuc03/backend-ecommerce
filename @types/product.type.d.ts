import { Types } from 'mongoose'

interface Product {
  _id?: Types.ObjectId
  name: string,
  image: string,
  images: string[],
  description: string,
  category: Types.ObjectId,
  price: number,
  price_before_discount: number,
  quantity: number,
  rating: number,
  view: number,
  sold: number,
  createdAt?: string
  updatedAt?: string
}