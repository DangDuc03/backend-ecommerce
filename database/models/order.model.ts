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

// Middleware để tự động xóa các purchase liên quan SAU KHI một order bị xóa
OrderSchema.post('findOneAndDelete', async function (doc) {
    // doc ở đây là order vừa bị xóa
    if (doc && doc.purchaseIds && doc.purchaseIds.length > 0) {
        const PurchaseModel = mongoose.model('purchases');
        await PurchaseModel.deleteMany({ _id: { $in: doc.purchaseIds } });
    }
});

export default mongoose.model<IOrder>('Order', OrderSchema); 