const express = require("express");
const router = express.Router();
const StockMovement = require("../models/StockMovement");
const Product = require("../models/Product");
const Batch = require("../models/Batch");
const { authenticateToken } = require("../middleware/auth");

// GET /api/stock-movements - Lấy danh sách hoạt động kho
router.get("/", authenticateToken, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      movementType,
      productId,
      batchId,
      reason,
      dateFrom,
      dateTo,
      search,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const query = {};

    // Filter by movement type
    if (movementType) {
      query.movementType = movementType;
    }

    // Filter by product
    if (productId) {
      query.productId = productId;
    }

    // Filter by batch
    if (batchId) {
      query.batchId = batchId;
    }

    // Filter by reason
    if (reason) {
      query.reason = reason;
    }

    // Filter by date range
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) {
        query.createdAt.$gte = new Date(dateFrom);
      }
      if (dateTo) {
        query.createdAt.$lte = new Date(dateTo);
      }
    }

    // Search by reference or notes
    if (search) {
      query.$or = [
        { reference: { $regex: search, $options: "i" } },
        { notes: { $regex: search, $options: "i" } },
      ];
    }

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === "desc" ? -1 : 1;

    const movements = await StockMovement.find(query)
      .populate("productId", "name category brand")
      .populate("batchId", "batchCode")
      .populate("performedBy", "name email")
      .populate("approvedBy", "name email")
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const total = await StockMovement.countDocuments(query);

    res.json({
      movements,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (error) {
    console.error("Error fetching stock movements:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// GET /api/stock-movements/:id - Lấy chi tiết hoạt động kho
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const movement = await StockMovement.findById(req.params.id)
      .populate("productId")
      .populate("batchId")
      .populate("performedBy", "name email")
      .populate("approvedBy", "name email");

    if (!movement) {
      return res.status(404).json({ message: "Stock movement not found" });
    }

    res.json({ movement });
  } catch (error) {
    console.error("Error fetching stock movement:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// POST /api/stock-movements - Tạo hoạt động kho mới
router.post("/", authenticateToken, async (req, res) => {
  try {
    const {
      movementType,
      productId,
      batchId,
      quantity,
      unitCost,
      reason,
      reference,
      referenceId,
      referenceModel,
      location,
      notes,
    } = req.body;

    // Validate required fields
    if (
      !movementType ||
      !productId ||
      !quantity ||
      !unitCost ||
      !reason ||
      !location
    ) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Check if product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Check if batch exists (if provided)
    if (batchId) {
      const batch = await Batch.findById(batchId);
      if (!batch) {
        return res.status(404).json({ message: "Batch not found" });
      }
    }

    const movement = new StockMovement({
      movementType,
      productId,
      batchId,
      quantity,
      unitCost,
      reason,
      reference,
      referenceId,
      referenceModel,
      location,
      notes,
      performedBy: req.user.id,
    });

    await movement.save();

    // Update product stock quantity
    const stockChange = movementType === "in" ? quantity : -quantity;
    await Product.findByIdAndUpdate(productId, {
      $inc: { stockQuantity: stockChange },
    });

    // Update batch remaining quantity if applicable
    if (batchId && movementType === "out") {
      await Batch.findByIdAndUpdate(batchId, {
        $inc: { remainingQuantity: -quantity },
      });
    }

    const populatedMovement = await StockMovement.findById(movement._id)
      .populate("productId", "name category brand")
      .populate("batchId", "batchCode")
      .populate("performedBy", "name email");

    res.status(201).json({
      message: "Stock movement created successfully",
      movement: populatedMovement,
    });
  } catch (error) {
    console.error("Error creating stock movement:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// PUT /api/stock-movements/:id - Cập nhật hoạt động kho
router.put("/:id", authenticateToken, async (req, res) => {
  try {
    const { notes, status } = req.body;

    const movement = await StockMovement.findById(req.params.id);
    if (!movement) {
      return res.status(404).json({ message: "Stock movement not found" });
    }

    // Only allow updating notes and status
    const updateData = {};
    if (notes !== undefined) updateData.notes = notes;
    if (status) updateData.status = status;

    // If status is being approved, set approvedBy and approvedAt
    if (status === "approved" && movement.status !== "approved") {
      updateData.approvedBy = req.user.id;
      updateData.approvedAt = new Date();
    }

    const updatedMovement = await StockMovement.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).populate("productId batchId performedBy approvedBy");

    res.json({
      message: "Stock movement updated successfully",
      movement: updatedMovement,
    });
  } catch (error) {
    console.error("Error updating stock movement:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// DELETE /api/stock-movements/:id - Xóa hoạt động kho
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const movement = await StockMovement.findById(req.params.id);
    if (!movement) {
      return res.status(404).json({ message: "Stock movement not found" });
    }

    // Only allow deletion of pending movements
    if (movement.status !== "pending") {
      return res.status(400).json({
        message: "Cannot delete non-pending stock movement",
      });
    }

    await StockMovement.findByIdAndDelete(req.params.id);

    res.json({ message: "Stock movement deleted successfully" });
  } catch (error) {
    console.error("Error deleting stock movement:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// POST /api/stock-movements/:id/approve - Phê duyệt hoạt động kho
router.post("/:id/approve", authenticateToken, async (req, res) => {
  try {
    const movement = await StockMovement.findById(req.params.id);
    if (!movement) {
      return res.status(404).json({ message: "Stock movement not found" });
    }

    if (movement.status === "approved") {
      return res.status(400).json({ message: "Movement is already approved" });
    }

    movement.status = "approved";
    movement.approvedBy = req.user.id;
    movement.approvedAt = new Date();

    await movement.save();

    const updatedMovement = await StockMovement.findById(movement._id).populate(
      "productId batchId performedBy approvedBy"
    );

    res.json({
      message: "Stock movement approved successfully",
      movement: updatedMovement,
    });
  } catch (error) {
    console.error("Error approving stock movement:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// GET /api/stock-movements/reports/summary - Báo cáo tổng hợp
router.get("/reports/summary", authenticateToken, async (req, res) => {
  try {
    const { dateFrom, dateTo, productId } = req.query;

    const query = {};
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) {
        query.createdAt.$gte = new Date(dateFrom);
      }
      if (dateTo) {
        query.createdAt.$lte = new Date(dateTo);
      }
    }
    if (productId) {
      query.productId = productId;
    }

    // Get movement statistics
    const stats = await StockMovement.aggregate([
      { $match: query },
      {
        $group: {
          _id: "$movementType",
          count: { $sum: 1 },
          totalQuantity: { $sum: "$quantity" },
          totalValue: { $sum: "$totalValue" },
        },
      },
    ]);

    // Get top products by movement
    const topProducts = await StockMovement.aggregate([
      { $match: query },
      {
        $group: {
          _id: "$productId",
          totalQuantity: { $sum: "$quantity" },
          totalValue: { $sum: "$totalValue" },
          count: { $sum: 1 },
        },
      },
      { $sort: { totalValue: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: "products",
          localField: "_id",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: "$product" },
    ]);

    // Get daily movement trends
    const dailyTrends = await StockMovement.aggregate([
      { $match: query },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          count: { $sum: 1 },
          totalQuantity: { $sum: "$quantity" },
          totalValue: { $sum: "$totalValue" },
        },
      },
      { $sort: { _id: 1 } },
      { $limit: 30 },
    ]);

    res.json({
      stats,
      topProducts,
      dailyTrends,
    });
  } catch (error) {
    console.error("Error generating stock movement report:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// GET /api/stock-movements/reports/inventory - Báo cáo tồn kho
router.get("/reports/inventory", authenticateToken, async (req, res) => {
  try {
    const { productId } = req.query;

    const query = {};
    if (productId) {
      query.productId = productId;
    }

    // Get current inventory levels
    const inventory = await Product.find(query)
      .select("name category brand stockQuantity price")
      .sort({ stockQuantity: 1 });

    // Get low stock products (less than 10 units)
    const lowStock = inventory.filter((product) => product.stockQuantity < 10);

    // Get out of stock products
    const outOfStock = inventory.filter(
      (product) => product.stockQuantity === 0
    );

    res.json({
      inventory,
      lowStock,
      outOfStock,
      summary: {
        totalProducts: inventory.length,
        lowStockCount: lowStock.length,
        outOfStockCount: outOfStock.length,
      },
    });
  } catch (error) {
    console.error("Error generating inventory report:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;
