const swaggerJSDoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Pharmacos API",
      version: "1.0.0",
      description: "API documentation for Pharmacos Server",
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        Payment: {
          type: "object",
          required: [
            "orderId",
            "userId",
            "amount",
            "payosOrderId",
            "status",
            "paymentUrl",
            "paymentMethod",
          ],
          properties: {
            orderId: {
              type: "string",
              description: "ID của đơn hàng",
            },
            userId: {
              type: "string",
              description: "ID của người dùng",
            },
            amount: {
              type: "number",
              description: "Số tiền thanh toán",
            },
            payosOrderId: {
              type: "string",
              description: "ID đơn hàng từ PayOS",
            },
            status: {
              type: "string",
              enum: ["pending", "completed", "failed", "cancelled"],
              description: "Trạng thái thanh toán",
            },
            paymentUrl: {
              type: "string",
              description: "URL thanh toán từ PayOS",
            },
            paymentMethod: {
              type: "string",
              enum: ["cod", "online", "cash", "bank"],
              description: "Phương thức thanh toán",
            },
            description: {
              type: "string",
              description: "Mô tả thanh toán",
            },
            transactionId: {
              type: "string",
              description: "ID giao dịch từ PayOS",
            },
            paidAt: {
              type: "string",
              format: "date-time",
              description: "Thời gian thanh toán thành công",
            },
          },
        },
        Product: {
          type: "object",
          properties: {
            _id: {
              type: "string",
              description: "ID của sản phẩm",
            },
            name: {
              type: "string",
              description: "Tên sản phẩm",
            },
            description: {
              type: "string",
              description: "Mô tả sản phẩm",
            },
            brand: {
              type: "array",
              items: {
                type: "string",
              },
              description: "Thương hiệu sản phẩm",
            },
            category: {
              type: "string",
              description: "Danh mục sản phẩm",
            },
          },
        },
        AISearch: {
          type: "object",
          properties: {
            userId: {
              type: "string",
              description: "ID của người dùng thực hiện tìm kiếm",
            },
            imageUrl: {
              type: "string",
              description: "Đường dẫn lưu hình ảnh đã upload",
            },
            geminiResult: {
              type: "string",
              description: "Kết quả phân tích từ Gemini AI",
            },
            matchedProducts: {
              type: "array",
              items: {
                type: "string",
              },
              description: "Danh sách ID các sản phẩm phù hợp",
            },
            searchedAt: {
              type: "string",
              format: "date-time",
              description: "Thời gian tìm kiếm",
            },
          },
        },
      },
    },
    tags: [
      {
        name: "AI Features",
        description: "Các chức năng AI sử dụng Google Gemini",
      },
      {
        name: "Payments",
        description: "APIs quản lý thanh toán với PayOS",
      },
    ],
    servers: [
      {
        url: "https://pharmacos-server-be.onrender.com",
        description: "Production server",
      },
      {
        url: "http://localhost:10000",
        description: "Local server",
      },
    ],
  },
  apis: ["./routes/*.js"],
};

const swaggerSpec = swaggerJSDoc(options);

module.exports = { swaggerUi, swaggerSpec };
