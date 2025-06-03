import mongoose, { Schema, Document } from 'mongoose';

export interface IMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    orders?: any;
}

export interface IChatContext extends Document {
    userId?: string;
    sessionId?: string;
    messages: IMessage[];
    lastIntent?: string;
    cart?: any;
    updatedAt: Date;
}

const MessageSchema = new Schema({
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    orders: { type: Schema.Types.Mixed, required: false },
});

const ChatContextSchema = new Schema<IChatContext>({
    userId: { type: String },
    sessionId: { type: String },
    messages: { type: [MessageSchema], default: [] },
    lastIntent: { type: String },
    cart: { type: Schema.Types.Mixed },
    updatedAt: { type: Date, default: Date.now },
});

ChatContextSchema.index({ userId: 1, sessionId: 1 });

export default mongoose.model<IChatContext>('ChatContext', ChatContextSchema); 