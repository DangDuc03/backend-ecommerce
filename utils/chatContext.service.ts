import ChatContext, { IChatContext, IMessage } from '../models/chatContext.model';

// Lấy context theo userId hoặc sessionId
export async function getContext({ userId, sessionId }: { userId?: string; sessionId?: string; }): Promise<IChatContext | null> {
    if (!userId && !sessionId) return null;
    return ChatContext.findOne({
        $or: [
            userId ? { userId } : {},
            sessionId ? { sessionId } : {}
        ]
    }).sort({ updatedAt: -1 }).exec();
}

// Lưu hoặc cập nhật context
export async function saveOrUpdateContext({ userId, sessionId, messages, lastIntent, cart }: {
    userId?: string;
    sessionId?: string;
    messages: IMessage[];
    lastIntent?: string;
    cart?: any;
}): Promise<IChatContext> {
    const filter: any = userId ? { userId } : { sessionId };
    const update = {
        messages,
        lastIntent,
        cart,
        updatedAt: new Date(),
    };
    return ChatContext.findOneAndUpdate(filter, update, { upsert: true, new: true }).exec();
}

// Thêm message mới vào context
export async function appendMessageToContext({ userId, sessionId, message, lastIntent, cart }: {
    userId?: string;
    sessionId?: string;
    message: IMessage;
    lastIntent?: string;
    cart?: any;
}): Promise<IChatContext> {
    const filter: any = userId ? { userId } : { sessionId };
    const context = await ChatContext.findOne(filter).exec();
    let messages = context?.messages || [];
    messages.push(message);
    // Giới hạn số lượng message lưu lại (ví dụ 20)
    if (messages.length > 20) messages = messages.slice(-20);
    return saveOrUpdateContext({ userId, sessionId, messages, lastIntent, cart });
} 