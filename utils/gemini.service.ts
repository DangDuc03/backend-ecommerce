import axios from 'axios';

const GEMINI_API_KEY = 'AIzaSyBeBBcwTvwkPhauaVQc9CJsmlzi9FdF1yg';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

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

export async function detectIntentGemini(userPrompt: string): Promise<string> {
    const intentPrompt = `Bạn là hệ thống phân tích ý định người dùng.\nCác intent hợp lệ:\n- search_product (tìm kiếm sản phẩm)\n- add_to_cart (thêm vào giỏ hàng)\n- view_cart (xem giỏ hàng)\n- order (đặt hàng)\n- info (hỏi thông tin)\n- other (khác)\n\nHãy đọc câu sau và trả về duy nhất 1 intent phù hợp nhất (chỉ trả về tên intent, không giải thích):\n\nCâu: \"${userPrompt}\"`;
    const result = await sendPromptGemini(intentPrompt);
    // Lấy intent đầu tiên trong kết quả trả về (loại bỏ các ký tự thừa)
    return result.split(/\s|\n/)[0].replace(/[^a-zA-Z_]/g, '').toLowerCase();
}

export async function extractProductNameGemini(userPrompt: string): Promise<string> {
    const extractPrompt = `
Bạn là hệ thống trích xuất tên sản phẩm từ yêu cầu của khách hàng.
Hãy đọc câu sau và trả về duy nhất tên sản phẩm mà khách muốn thêm vào giỏ hàng (chỉ trả về tên sản phẩm, không giải thích, không thêm ký tự thừa):

Câu: "${userPrompt}"
  `;
    const result = await sendPromptGemini(extractPrompt);
    // Lấy dòng đầu tiên, loại bỏ ký tự thừa
    return result.split('\n')[0].replace(/["']/g, '').trim();
} 