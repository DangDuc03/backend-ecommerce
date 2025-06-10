import { Request, Response } from 'express';
import OrderModel, { IOrder } from '../database/models/order.model';
import { PurchaseModel } from '../database/models/purchase.model';
import { ProductModel } from '../database/models/product.model';
import { STATUS_PURCHASE } from '../constants/purchase';
import { FilterQuery } from 'mongoose';

export const listOrders = async (req: Request, res: Response) => {
    const { page = 1, limit = 10, search = '', status = '' } = req.query;
    const query: FilterQuery<IOrder> = {};
    if (status !== '') query.status = Number(status);
    if (search) {
        const searchString = search as string;
        query.$or = [
            { userName: { $regex: searchString, $options: 'i' } },
            { userId: { $regex: searchString, $options: 'i' } },
        ];
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [orders, total] = await Promise.all([
        OrderModel.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(Number(limit))
            .lean<IOrder[]>(),
        OrderModel.countDocuments(query)
    ]);
    res.json({ data: { orders, total } });
};

export const getOrderDetail = async (req: Request, res: Response) => {
    const { id } = req.params;
    const order = await OrderModel.findById(id).lean<IOrder>();
    if (!order) return res.status(404).json({ message: 'Order not found' });
    res.json({ data: order });
};

export const updateOrder = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { status } = req.body;
    const order = await OrderModel.findByIdAndUpdate(id, { status }, { new: true }).lean<IOrder>();
    if (!order) return res.status(404).json({ message: 'Order not found' });
    // Đồng bộ purchases liên quan
    if (order.purchaseIds && order.purchaseIds.length > 0) {
        await PurchaseModel.updateMany(
            { _id: { $in: order.purchaseIds } },
            { status }
        );
    }
    // Nếu huỷ đơn, cộng lại số lượng vào kho
    if (status === STATUS_PURCHASE.CANCELLED && order.items && order.items.length > 0) {
        for (const item of order.items) {
            await ProductModel.findByIdAndUpdate(item.productId, { $inc: { quantity: item.quantity } });
        }
    }
    res.json({ message: 'Order updated', data: order });
};

export const deleteOrder = async (req: Request, res: Response) => {
    const { id } = req.params;
    const order = await OrderModel.findByIdAndDelete(id).lean<IOrder>();
    if (!order) return res.status(404).json({ message: 'Order not found' });
    // Khi xóa đơn, có thể cập nhật purchases liên quan về trạng thái huỷ nếu muốn
    if (order.purchaseIds && order.purchaseIds.length > 0) {
        await PurchaseModel.updateMany(
            { _id: { $in: order.purchaseIds } },
            { status: STATUS_PURCHASE.CANCELLED }
        );
    }
    // Khi xóa đơn, cộng lại số lượng vào kho
    if (order.items && order.items.length > 0) {
        for (const item of order.items) {
            await ProductModel.findByIdAndUpdate(item.productId, { $inc: { quantity: item.quantity } });
        }
    }
    res.json({ message: 'Order deleted', data: order });
}; 