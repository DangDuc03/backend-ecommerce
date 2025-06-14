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

    const intentPrompt = `Bạn là hệ thống phân tích ý định người dùng.\nCác intent hợp lệ:\n- search_product (tìm kiếm sản phẩm)\n- add_to_cart (thêm vào giỏ hàng)\n- view_cart (xem giỏ hàng)\n- order (đặt hàng, thanh toán, mua hàng, tôi muốn mua, tôi muốn đặt, tôi muốn thanh toán, mua tất cả, mua sản phẩm, đặt tất cả, đặt hàng, thanh toán giỏ hàng, checkout)\n- info (hỏi thông tin)\n- check_order_status (kiểm tra trạng thái đơn hàng)\n- cancel_order (hủy đơn hàng)\n- change_cart_quantity (thay đổi số lượng sản phẩm trong giỏ hàng)\n- suggest_product (gợi ý sản phẩm, tư vấn sản phẩm, sản phẩm phù hợp, sản phẩm trong tầm giá, sản phẩm giá rẻ, sản phẩm nổi bật, sản phẩm bán chạy, tôi nên mua gì, gợi ý cho tôi, tư vấn cho tôi, sản phẩm nào tốt, sản phẩm nào phù hợp, sản phẩm nào trong khoảng giá, sản phẩm nào từ ... đến ...)\n- update_profile (cập nhật thông tin, cập nhật tên, cập nhật số điện thoại, cập nhật địa chỉ, đổi tên, đổi sđt, đổi địa chỉ, tôi muốn đổi tên, tôi muốn đổi sđt, tôi muốn đổi địa chỉ, tôi muốn cập nhật thông tin, tôi muốn cập nhật profile, tôi muốn cập nhật tài khoản)\n- other (khác)\n\nHãy đọc câu sau và trả về duy nhất 1 intent phù hợp nhất (chỉ trả về tên intent, không giải thích).\n${LANGUAGE_INSTRUCTION}\n\nCâu: "${userPrompt}"`
    const result = await sendPromptAI(intentPrompt)
    return result.split(/\s|\n/)[0].replace(/[^a-zA-Z_]/g, '').toLowerCase();
}

export async function extractProductNameAI(userPrompt: string): Promise<string> {
    const extractPrompt = `Bạn là hệ thống trích xuất tên sản phẩm từ yêu cầu của khách hàng.\nHãy đọc câu sau và trả về duy nhất tên sản phẩm mà khách muốn thêm vào giỏ hàng (chỉ trả về tên sản phẩm, không giải thích, không thêm ký tự thừa).\n${LANGUAGE_INSTRUCTION}\n\nCâu: \"${userPrompt}\"`;
    const result = await sendPromptAI(extractPrompt)
    return result.split('\n')[0].replace(/["']/g, '').trim();
}
