import ChatContext, { IChatContext, IMessage } from '../models/chatContext.model';

// Lấy context theo userId hoặc sessionId
export async function getContext({ userId, sessionId }: { userId?: string; sessionId?: string; }): Promise<IChatContext | null> {
    if (userId) {
        return ChatContext.findOne({ userId }).sort({ updatedAt: -1 }).exec();
    }
    if (sessionId) {
        return ChatContext.findOne({ sessionId }).sort({ updatedAt: -1 }).exec();
    }
    // Nếu không có userId/sessionId, trả về null, không query DB
    return null;
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
}): Promise<IChatContext | null> {
    let filter: any = {};
    if (userId) filter = { userId };
    else if (sessionId) filter = { sessionId };
    else return null; // Không có userId/sessionId thì không làm gì cả

    const context = await ChatContext.findOne(filter).exec();
    let messages = context?.messages || [];
    messages.push(message);
    if (messages.length > 20) messages = messages.slice(-20);
    return saveOrUpdateContext({ userId, sessionId, messages, lastIntent, cart });
} 