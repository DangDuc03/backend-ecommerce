import mongoose, { Schema, Document } from 'mongoose';

export interface IOrder extends Document {
    userId: string;
    items: { productId: string; name: string; price: number; quantity: number }[];
    total: number;
    status: string;
    createdAt: Date;
    purchaseIds: string[];
}

const OrderSchema = new Schema<IOrder>({
    userId: { type: String, required: true },
    items: [
        {
            productId: String,
            name: String,
            price: Number,
            quantity: Number,
        }
    ],
    total: Number,
    status: { type: String, default: 'pending' },
    createdAt: { type: Date, default: Date.now },
    purchaseIds: [{ type: Schema.Types.ObjectId, ref: 'purchases' }]
});

export default mongoose.model<IOrder>('Order', OrderSchema); 