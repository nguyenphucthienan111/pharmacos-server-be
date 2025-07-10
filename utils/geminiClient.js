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

// Hàm delay với random jitter
function delay(ms) {
  return new Promise((resolve) =>
    setTimeout(resolve, ms + Math.random() * 1000)
  );
}

// Hàm search sản phẩm bằng hình ảnh với retry logic
async function searchProductByImage(imageBuffer, mimeType, maxRetries = 3) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  const imagePart = await fileToGenerativePart(imageBuffer, mimeType);

  // Cải thiện prompt để có kết quả tốt hơn
  const prompt = `
    Please analyze this product image and provide detailed information about the product.
    Focus on:
    - **Brand name** (e.g., Chanel, Gucci, L'Oreal, etc.)
    - **Product name** (exact product name)
    - **Product type** (serum, cream, powder, foundation, lipstick, etc.)
    - **Key ingredients** if visible
    - **Product benefits** or features
    
    Format your response clearly with the product name in **bold**.
  `;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Gemini API attempt ${attempt}/${maxRetries}`);

      // Gọi API Gemini với timeout
      const result = await Promise.race([
        model.generateContent([prompt, imagePart]),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Gemini API timeout")), 30000)
        ),
      ]);

      const response = await result.response;
      const text = response.text();

      console.log(`Gemini API success on attempt ${attempt}`);
      return text;
    } catch (error) {
      console.error(`Gemini API attempt ${attempt} failed:`, error.message);

      // Retry logic for specific errors
      const shouldRetry =
        attempt < maxRetries &&
        (error.status === 503 || // Service Unavailable
          error.status === 429 || // Rate Limited
          error.status === 500 || // Internal Server Error
          error.message.includes("timeout") ||
          error.message.includes("overloaded"));

      if (shouldRetry) {
        // Exponential backoff with jitter
        const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        console.log(`Retrying in ${delayMs}ms...`);
        await delay(delayMs);
        continue;
      }

      // Final attempt failed or non-retryable error
      if (attempt === maxRetries) {
        console.error(
          `All ${maxRetries} attempts failed. Returning fallback response.`
        );
        // Return a fallback response để AI search vẫn có thể hoạt động
        return `**Product Analysis Failed**
        
        Unable to analyze the image due to service limitations. 
        The image appears to be a cosmetic or skincare product.
        Please try uploading the image again in a few minutes.
        `;
      }

      throw error;
    }
  }
}

module.exports = {
  searchProductByImage,
};
