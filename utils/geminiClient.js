const { GoogleGenerativeAI } = require("@google/generative-ai");

// Khởi tạo Gemini API với API key
const genAI = new GoogleGenerativeAI("AIzaSyAB9sgGBPAr0mDVa-8qEEH0gsUKNFkqfis");

// Hàm chuyển đổi file thành base64
async function fileToGenerativePart(buffer, mimeType) {
  return {
    inlineData: {
      data: buffer.toString("base64"),
      mimeType,
    },
  };
}

// Hàm search sản phẩm bằng hình ảnh
async function searchProductByImage(imageBuffer, mimeType) {
  try {
    // Lấy model gemini-1.5-flash
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Chuyển đổi hình ảnh thành định dạng phù hợp
    const imagePart = await fileToGenerativePart(imageBuffer, mimeType);

    // Tạo prompt cho Gemini
    const prompt =
      "Đây là hình ảnh của sản phẩm gì? Hãy mô tả chi tiết về sản phẩm này và đưa ra tên chính xác của sản phẩm.";

    // Gọi API Gemini để phân tích hình ảnh
    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;

    return response.text();
  } catch (error) {
    console.error("Lỗi khi gọi Gemini API:", error);
    throw error;
  }
}

module.exports = {
  searchProductByImage,
};
