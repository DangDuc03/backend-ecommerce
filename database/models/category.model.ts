import { Schema, model, Document } from 'mongoose'

export interface ICategory extends Document {
  name: string
  image: string
  createAt: Date
  updateAt: Date
}

const CategorySchema = new Schema(
  {
    name: {
      type: String,
      require: true,
      trim: true
    },
    image: {
      type: String,
      require: true
    },
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
    collection: 'categories'
  }
)

export const CategoryModel = model<ICategory>('categories', CategorySchema)
