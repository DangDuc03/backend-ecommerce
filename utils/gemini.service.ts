import axios from 'axios';

const GEMINI_API_KEY = 'AIzaSyBeBBcwTvwkPhauaVQc9CJsmlzi9FdF1yg';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';

export async function sendPromptGemini(prompt: string): Promise<string> {
    try {
        const response = await axios.post(
            `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`,
            {
                contents: [
                    {
                        parts: [
                            { text: prompt }
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