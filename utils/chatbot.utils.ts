export const HISTORY_LIMIT = 5;

export function getRecentHistory(context: any, n: number = HISTORY_LIMIT) {
    const history = context?.messages || [];
    return history.slice(-n).map((msg: any) => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content
    }));
}

export function buildChatPrompt(history: { role: string, content: string }[], prompt: string) {
    let chatPrompt = '';
    history.forEach(msg => {
        chatPrompt += `${msg.role === 'user' ? 'Người dùng' : 'Trợ lý'}: ${msg.content}\n`;
    });
    chatPrompt += `Người dùng: ${prompt}\nTrợ lý:`;
    return chatPrompt;
}

export function mapCartFromPurchases(purchases: any[]) {
    return purchases.map((item, idx) =>
        `${idx + 1}. ${item.product.name} - ${item.buy_count} x ${(item.price).toLocaleString()}đ`
    ).join('\n');
} 