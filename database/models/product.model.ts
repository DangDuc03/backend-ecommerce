import mongoose, { Schema, model, Document } from 'mongoose'
import { ICategory } from './category.model'

export interface IProduct extends Document {
  name: string
  image: string
  images: string[]
  description: string
  category: ICategory['_id']
  price: number
  price_before_discount: number
  quantity: number
  sold: number
  view: number
  rating: number
  createAt: Date
  updateAt: Date
}

const ProductSchema = new Schema(
  {
    name: { type: String, required: true, maxlength: 160 },
    image: { type: String, required: true, maxlength: 1000 },
    images: [{ type: String, maxlength: 1000 }],
    description: { type: String },
    category: { type: mongoose.SchemaTypes.ObjectId, ref: 'categories' },
    price: { type: Number, default: 0 },
    rating: { type: Number, default: 0 },
    price_before_discount: { type: Number, default: 0 },
    quantity: { type: Number, default: 0 },
    sold: { type: Number, default: 0 },
    view: { type: Number, default: 0 },
    createAt: {
      type: Date,
      default: Date.now
    },
    updateAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true,
    collection: 'products'
  }
)

export const ProductModel = model<IProduct>('products', ProductSchema)
