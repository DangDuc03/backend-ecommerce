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
    else return null;

    const context = await ChatContext.findOne(filter).exec();
    let messages = context?.messages || [];

    // Thêm message mới
    messages.push(message);

    // Giữ lại 10 messages gần nhất thay vì 20 để tối ưu context
    if (messages.length > 10) {
        messages = messages.slice(-10);
    }

    // Cập nhật lastIntent nếu có
    if (lastIntent) {
        context.lastIntent = lastIntent;
    }

    // Cập nhật cart nếu có
    if (cart) {
        context.cart = cart;
    }

    // Cập nhật timestamp
    context.updatedAt = new Date();

    return saveOrUpdateContext({ userId, sessionId, messages, lastIntent, cart });
}

// Lấy context với thông tin bổ sung
export async function getEnhancedContext({ userId, sessionId }: { userId?: string; sessionId?: string }): Promise<any> {
    const context = await getContext({ userId, sessionId });
    if (!context) return null;

    // Thêm thông tin bổ sung vào context
    const enhancedContext = {
        ...context.toObject(),
        lastMessage: context.messages[context.messages.length - 1],
        lastIntent: context.lastIntent,
        cart: context.cart,
        messageCount: context.messages.length
    };

    return enhancedContext;
} 