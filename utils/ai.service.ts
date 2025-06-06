import { sendPromptGemini } from './gemini.service'
import { sendPromptOpenAI } from './openai.service'
// Nếu sau này dùng OpenAI, import thêm ở đây

const AI_PROVIDER = process.env.AI_PROVIDER || 'gemini' // 'gemini' | 'openai'
const LANGUAGE_INSTRUCTION = 'Luôn trả lời bằng tiếng Việt.'

// prompt: nội dung user hỏi, history: mảng các message trước đó (role, content)
export async function sendPromptAI(prompt: string, history: { role: string, content: string }[] = []): Promise<string> {
    const fullPrompt = `${prompt}\n${LANGUAGE_INSTRUCTION}`
    if (AI_PROVIDER === 'gemini') {
        return sendPromptGemini(fullPrompt, history)
    }
    if (AI_PROVIDER === 'openai') {
        // Chỉ gửi 3-5 lượt chat gần nhất cho OpenAI
        return sendPromptOpenAI(fullPrompt, history.slice(-5))
    }
    return 'Chưa cấu hình AI provider phù hợp.'
}

export async function detectIntentAI(userPrompt: string): Promise<string> {
    const intentPrompt = `Bạn là trợ lý thông minh của cửa hàng trực tuyến. Hãy phân tích câu nói của khách hàng và xác định ý định chính của họ.

Các ý định chính:
- search_product: Khi khách hàng muốn tìm kiếm, xem, hỏi về sản phẩm
- add_to_cart: Khi khách hàng muốn thêm sản phẩm vào giỏ hàng
- view_cart: Khi khách hàng muốn xem giỏ hàng
- order: Khi khách hàng muốn đặt hàng hoặc thanh toán
- info: Khi khách hàng cần thông tin hoặc tư vấn
- check_order_status: Khi khách hàng muốn kiểm tra đơn hàng
- cancel_order: Khi khách hàng muốn hủy đơn hàng
- change_cart_quantity: Khi khách hàng muốn thay đổi số lượng trong giỏ hàng
- suggest_product: Khi khách hàng cần gợi ý sản phẩm
- update_profile: Khi khách hàng muốn cập nhật thông tin cá nhân
- other: Các ý định khác

Hướng dẫn phân tích:
1. Đọc kỹ câu nói của khách hàng
2. Hiểu ý định thực sự, không chỉ dựa vào từ khóa
3. Xem xét ngữ cảnh và cách diễn đạt
4. Chọn ý định phù hợp nhất

Câu của khách hàng: "${userPrompt}"`

    const result = await sendPromptAI(intentPrompt)
    return result.split(/\s|\n/)[0].replace(/[^a-zA-Z_]/g, '').toLowerCase();
}

export async function extractProductNameAI(userPrompt: string): Promise<string> {
    const extractPrompt = `Bạn là hệ thống trích xuất tên sản phẩm từ yêu cầu của khách hàng.\nHãy đọc câu sau và trả về duy nhất tên sản phẩm mà khách muốn thêm vào giỏ hàng (chỉ trả về tên sản phẩm, không giải thích, không thêm ký tự thừa).\n${LANGUAGE_INSTRUCTION}\n\nCâu: \"${userPrompt}\"`;
    const result = await sendPromptAI(extractPrompt)
    return result.split('\n')[0].replace(/["']/g, '').trim();
}
