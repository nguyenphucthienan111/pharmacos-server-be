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
    servers: [
      {
        url: "http://localhost:5000", // Thay đổi nếu deploy lên server thật
      },
    ],
  },
  apis: ["./routes/*.js"], // Đường dẫn tới các file route để swagger-jsdoc quét comment
};

const swaggerSpec = swaggerJSDoc(options);

module.exports = { swaggerUi, swaggerSpec };
