import mongoose, { Schema, Document } from 'mongoose';
import { STATUS_PURCHASE } from '../../constants/purchase';

export interface IOrder extends Document {
    userId: string;
    items: { productId: string; name: string; price: number; quantity: number }[];
    total: number;
    status: number;
    createdAt: Date;
    purchaseIds: string[];
}

const OrderSchema = new Schema<IOrder>({
    userId: { type: String, required: true },
    userName: { type: String, required: true },
    items: [
        {
            productId: String,
            name: String,
            price: Number,
            quantity: Number,
        }
    ],
    total: Number,
    status: { type: Number, default: STATUS_PURCHASE.WAIT_FOR_CONFIRMATION },
    createdAt: { type: Date, default: Date.now },
    purchaseIds: [{ type: Schema.Types.ObjectId, ref: 'purchases' }]
});

export default mongoose.model<IOrder>('Order', OrderSchema); 