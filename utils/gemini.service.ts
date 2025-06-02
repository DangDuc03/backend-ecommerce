import axios from 'axios';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

export async function sendPromptGemini(prompt: string, history: { role: string, content: string }[] = []): Promise<string> {
    try {
        // Chỉ lấy 3-5 lượt chat gần nhất
        const recentHistory = history.slice(-5)
        // Build hội thoại dạng Gemini
        let chatPrompt = ''
        for (const msg of recentHistory) {
            chatPrompt += `${msg.role === 'user' ? 'Người dùng' : 'Trợ lý'}: ${msg.content}\n`
        }
        chatPrompt += `Người dùng: ${prompt}\nTrợ lý:`
        const response = await axios.post(
            `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`,
            {
                contents: [
                    {
                        parts: [
                            { text: chatPrompt }
                        ]
                    }
                ]
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                },
            }
        );
        // Lấy nội dung trả về từ Gemini
        const candidates = response.data.candidates;
        if (candidates && candidates.length > 0) {
            return candidates[0].content.parts[0].text;
        }
        return 'Không nhận được phản hồi từ Gemini.';
    } catch (error: any) {
        console.error('Gemini API error:', error.response?.data || error.message);
        return 'Đã xảy ra lỗi khi kết nối Gemini API.';
    }
}
