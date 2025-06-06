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

export function extractProductInfo(prompt: string): { name: string; quantity: number; category?: string } {
    // Extract quantity if present
    const quantityMatch = prompt.match(/(\d+)\s*(chiếc|cái|sản phẩm|sp|item)/i);
    const quantity = quantityMatch ? parseInt(quantityMatch[1]) : 1;

    // Extract category if present
    const categories = ['điện thoại', 'laptop', 'đồng hồ', 'áo thun'];
    const categoryMatch = categories.find(cat => prompt.toLowerCase().includes(cat));

    // Extract product name - remove quantity and category words
    let name = prompt.toLowerCase();
    if (quantityMatch) {
        name = name.replace(quantityMatch[0], '');
    }
    if (categoryMatch) {
        name = name.replace(categoryMatch, '');
    }
    name = name.replace(/\s+/g, ' ').trim();

    return {
        name,
        quantity,
        category: categoryMatch
    };
}

export function buildProductSearchPrompt(productInfo: { name: string; quantity: number; category?: string }): string {
    let prompt = `Tìm kiếm sản phẩm với thông tin sau:\n`;
    prompt += `- Tên sản phẩm: ${productInfo.name}\n`;
    if (productInfo.category) {
        prompt += `- Danh mục: ${productInfo.category}\n`;
    }
    prompt += `- Số lượng: ${productInfo.quantity}\n\n`;
    prompt += `Hãy tìm kiếm sản phẩm phù hợp nhất với thông tin trên. Nếu không tìm thấy sản phẩm chính xác, hãy gợi ý các sản phẩm tương tự.`;
    return prompt;
} 