import axios from 'axios';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

export async function sendPromptOpenAI(prompt: string, history: { role: string, content: string }[] = []): Promise<string> {
    try {
        // Chỉ giữ 3-5 lượt chat gần nhất (nếu có)
        const recentHistory = history.slice(-5);
        const messages = [
            { role: 'system', content: 'Bạn là trợ lý AI trả lời bằng tiếng Việt, thân thiện, ngắn gọn.' },
            ...recentHistory,
            { role: 'user', content: prompt }
        ];
        const response = await axios.post(
            OPENAI_API_URL,
            {
                model: 'gpt-3.5-turbo',
                messages,
                max_tokens: 400
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${OPENAI_API_KEY}`
                }
            }
        );
        return response.data.choices?.[0]?.message?.content || 'Không nhận được phản hồi từ OpenAI.';
    } catch (error: any) {
        console.error('OpenAI API error:', error.response?.data || error.message);
        return 'Đã xảy ra lỗi khi kết nối OpenAI API.';
    }
} 