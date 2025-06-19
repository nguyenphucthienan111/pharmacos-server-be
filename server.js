const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");
const { authenticateToken } = require("./middleware/auth");
const path = require("path");
const app = express();

app.use(express.static(path.join(__dirname, "../public")));

// Load environment variables
dotenv.config();

// Swagger definition
const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Pharmacos Manager API",
      version: "1.0.0",
      description: "API documentation for Pharmacos Manager system",
      contact: {
        name: "API Support",
        email: "support@pharmacos.com",
      },
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT || 10000}`,
        description: "Development server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: [path.join(__dirname, "routes/*.js")], // Path to the API routes
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// Middleware
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database connection
const { connectToDatabase } = require("./config/database");
connectToDatabase().catch((error) => {
  console.error("MongoDB connection error:", error);
  process.exit(1);
});
// Import routes
const authRoutes = require("./routes/auth");
const customerRoutes = require("./routes/customers");
const productRoutes = require("./routes/products");
const orderRoutes = require("./routes/orders");
const cartRoutes = require("./routes/cart");
const aiRoutes = require("./routes/ai");
const adminRoutes = require("./routes/admin");
const staffRoutes = require("./routes/staff");
const favoriteRoutes = require("./routes/favorites");

// Use routes
app.use("/api/auth", authRoutes);
app.use("/api/customers", authenticateToken, customerRoutes);
app.use("/api/products", productRoutes); // Public access for products
app.use("/api/orders", authenticateToken, orderRoutes);
app.use("/api/cart", cartRoutes); // Cart management
app.use("/api/ai", aiRoutes); // AI features
app.use("/api/admin", authenticateToken, adminRoutes);
app.use("/api/staff", authenticateToken, staffRoutes);
app.use("/api/favorites", authenticateToken, favoriteRoutes); // Favorites management

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    message: "Something went wrong!",
    error: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(
    `Swagger documentation available at http://localhost:${PORT}/api-docs`
  );
});
