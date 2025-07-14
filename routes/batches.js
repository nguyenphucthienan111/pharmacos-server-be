const express = require("express");
const router = express.Router();
const Batch = require("../models/Batch");
const Product = require("../models/Product");
const Supplier = require("../models/Supplier");
const StockMovement = require("../models/StockMovement");
const { authenticateToken } = require("../middleware/auth");

/**
 * @swagger
 * components:
 *   schemas:
 *     Batch:
 *       type: object
 *       required:
 *         - batchCode
 *         - productId
 *         - supplierId
 *         - quantity
 *         - unitCost
 *         - manufacturingDate
 *         - expiryDate
 *         - location
 *       properties:
 *         _id:
 *           type: string
 *           description: Batch ID
 *         batchCode:
 *           type: string
 *           description: Unique batch code
 *         productId:
 *           type: string
 *           description: Product ID
 *         supplierId:
 *           type: string
 *           description: Supplier ID
 *         quantity:
 *           type: number
 *           description: Initial quantity
 *         remainingQuantity:
 *           type: number
 *           description: Current remaining quantity
 *         unitCost:
 *           type: number
 *           description: Cost per unit
 *         totalCost:
 *           type: number
 *           description: Total cost of batch
 *         manufacturingDate:
 *           type: string
 *           format: date
 *           description: Manufacturing date
 *         expiryDate:
 *           type: string
 *           format: date
 *           description: Expiry date
 *         status:
 *           type: string
 *           enum: [pending, received, active, expired, recalled, disposed]
 *           description: Batch status
 *         location:
 *           type: string
 *           description: Storage location
 *         notes:
 *           type: string
 *           description: Additional notes
 *         qualityCheck:
 *           type: object
 *           properties:
 *             passed:
 *               type: boolean
 *             checkedBy:
 *               type: string
 *             checkedAt:
 *               type: string
 *               format: date-time
 *             notes:
 *               type: string
 *         createdBy:
 *           type: string
 *           description: Staff ID who created the batch
 *         approvedBy:
 *           type: string
 *           description: Admin ID who approved the batch
 *         approvedAt:
 *           type: string
 *           format: date-time
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/batches:
 *   get:
 *     summary: Get all batches with pagination and filtering
 *     tags: [Inventory Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, received, active, expired, recalled, disposed]
 *         description: Filter by batch status
 *       - in: query
 *         name: supplier
 *         schema:
 *           type: string
 *         description: Filter by supplier ID
 *       - in: query
 *         name: product
 *         schema:
 *           type: string
 *         description: Filter by product ID
 *       - in: query
 *         name: expiring
 *         schema:
 *           type: boolean
 *         description: Filter expiring batches
 *     responses:
 *       200:
 *         description: List of batches
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 batches:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Batch'
 *                 totalPages:
 *                   type: integer
 *                 currentPage:
 *                   type: integer
 *                 totalBatches:
 *                   type: integer
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
// GET /api/batches - Lấy danh sách lô hàng
router.get("/", authenticateToken, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      productId,
      supplierId,
      expiryStatus,
      search,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const query = {};

    // Filter by status
    if (status) {
      query.status = status;
    }

    // Filter by product
    if (productId) {
      query.productId = productId;
    }

    // Filter by supplier
    if (supplierId) {
      query.supplierId = supplierId;
    }

    // Filter by expiry status
    if (expiryStatus) {
      const today = new Date();
      switch (expiryStatus) {
        case "expired":
          query.expiryDate = { $lt: today };
          break;
        case "expiring_soon":
          const thirtyDaysFromNow = new Date();
          thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
          query.expiryDate = { $gte: today, $lte: thirtyDaysFromNow };
          break;
        case "expiring_warning":
          const ninetyDaysFromNow = new Date();
          ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90);
          query.expiryDate = { $gte: today, $lte: ninetyDaysFromNow };
          break;
        case "good":
          const futureDate = new Date();
          futureDate.setDate(futureDate.getDate() + 90);
          query.expiryDate = { $gt: futureDate };
          break;
      }
    }

    // Search by batch code or product name
    if (search) {
      query.$or = [
        { batchCode: { $regex: search, $options: "i" } },
        { notes: { $regex: search, $options: "i" } },
      ];
    }

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === "desc" ? -1 : 1;

    const batches = await Batch.find(query)
      .populate("productId", "name category brand")
      .populate("supplierId", "name code")
      .populate("createdBy", "name email")
      .populate("approvedBy", "name email")
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const total = await Batch.countDocuments(query);

    res.json({
      batches,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (error) {
    console.error("Error fetching batches:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// GET /api/batches/:id - Lấy chi tiết lô hàng
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const batch = await Batch.findById(req.params.id)
      .populate("productId")
      .populate("supplierId")
      .populate("createdBy", "name email")
      .populate("approvedBy", "name email")
      .populate("qualityCheck.checkedBy", "name email");

    if (!batch) {
      return res.status(404).json({ message: "Batch not found" });
    }

    // Get stock movements for this batch
    const stockMovements = await StockMovement.find({ batchId: batch._id })
      .populate("performedBy", "name email")
      .populate("approvedBy", "name email")
      .sort({ createdAt: -1 });

    res.json({
      batch,
      stockMovements,
    });
  } catch (error) {
    console.error("Error fetching batch:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * @swagger
 * /api/batches:
 *   post:
 *     summary: Create a new batch
 *     tags: [Inventory Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Batch'
 *     responses:
 *       201:
 *         description: Batch created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Batch'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
// POST /api/batches - Tạo lô hàng mới
router.post("/", authenticateToken, async (req, res) => {
  try {
    const {
      productId,
      supplierId,
      quantity,
      unitCost,
      manufacturingDate,
      expiryDate,
      location,
      notes,
    } = req.body;

    // Validate required fields
    if (
      !productId ||
      !supplierId ||
      !quantity ||
      !unitCost ||
      !manufacturingDate ||
      !expiryDate ||
      !location
    ) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Check if product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Check if supplier exists
    const supplier = await Supplier.findById(supplierId);
    if (!supplier) {
      return res.status(404).json({ message: "Supplier not found" });
    }

    // Generate batch code
    const batchCode = await Batch.generateBatchCode();

    const batch = new Batch({
      batchCode,
      productId,
      supplierId,
      quantity,
      unitCost,
      manufacturingDate,
      expiryDate,
      location,
      notes,
      createdBy: req.user.id,
      totalCost: quantity * unitCost,
    });

    await batch.save();

    // Tăng totalOrders và totalValue cho supplier khi tạo batch (nhập hàng)
    await Supplier.findByIdAndUpdate(supplierId, {
      $inc: {
        totalOrders: 1,
        totalValue: batch.totalCost,
      },
    });

    const populatedBatch = await Batch.findById(batch._id)
      .populate("productId", "name category brand")
      .populate("supplierId", "name code")
      .populate("createdBy", "name email");

    res.status(201).json({
      message: "Batch created successfully",
      batch: populatedBatch,
    });
  } catch (error) {
    console.error("Error creating batch:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * @swagger
 * /api/batches/{id}:
 *   put:
 *     summary: Update a batch
 *     tags: [Inventory Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Batch ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Batch'
 *     responses:
 *       200:
 *         description: Batch updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Batch'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Batch not found
 *       500:
 *         description: Internal server error
 *   delete:
 *     summary: Delete a batch
 *     tags: [Inventory Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Batch ID
 *     responses:
 *       200:
 *         description: Batch deleted successfully
 *       400:
 *         description: Cannot delete batch with remaining quantity
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Batch not found
 *       500:
 *         description: Internal server error
 */
// PUT /api/batches/:id - Cập nhật lô hàng
router.put("/:id", authenticateToken, async (req, res) => {
  try {
    const { status, location, notes, qualityCheck } = req.body;

    const batch = await Batch.findById(req.params.id);
    if (!batch) {
      return res.status(404).json({ message: "Batch not found" });
    }

    // Only allow certain fields to be updated
    const updateData = {};
    if (status) updateData.status = status;
    if (location) updateData.location = location;
    if (notes !== undefined) updateData.notes = notes;
    if (qualityCheck) {
      // Only staff or admin can update quality check
      if (req.user.role !== "staff" && req.user.role !== "admin") {
        return res.status(403).json({
          message: "You do not have permission to update quality check.",
        });
      }
      updateData.qualityCheck = {
        ...batch.qualityCheck,
        ...qualityCheck,
        checkedBy: req.user.id,
        checkedAt: new Date(),
      };
    }

    // If status is being changed to active, approve the batch
    if (status === "active" && batch.status !== "active") {
      updateData.approvedBy = req.user.id;
      updateData.approvedAt = new Date();
    }

    const updatedBatch = await Batch.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).populate("productId supplierId createdBy approvedBy");

    res.json({
      message: "Batch updated successfully",
      batch: updatedBatch,
    });
  } catch (error) {
    console.error("Error updating batch:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * @swagger
 * /api/batches/{id}:
 *   delete:
 *     summary: Delete a batch
 *     tags: [Inventory Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Batch ID
 *     responses:
 *       200:
 *         description: Batch deleted successfully
 *       400:
 *         description: Cannot delete batch with remaining quantity
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Batch not found
 *       500:
 *         description: Internal server error
 */
// DELETE /api/batches/:id - Xóa lô hàng
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const batch = await Batch.findById(req.params.id);
    if (!batch) {
      return res.status(404).json({ message: "Batch not found" });
    }

    // Check if batch has remaining quantity
    if (batch.remainingQuantity > 0) {
      return res.status(400).json({
        message: "Cannot delete batch with remaining quantity",
      });
    }

    await Batch.findByIdAndDelete(req.params.id);

    res.json({ message: "Batch deleted successfully" });
  } catch (error) {
    console.error("Error deleting batch:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * @swagger
 * /api/batches/{id}/approve:
 *   post:
 *     summary: Approve a batch (activate and import to inventory)
 *     tags: [Inventory Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Batch ID
 *     responses:
 *       200:
 *         description: Batch approved successfully
 *       400:
 *         description: Batch is already active
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Batch not found
 *       500:
 *         description: Internal server error
 */
// POST /api/batches/:id/approve - Phê duyệt lô hàng
router.post("/:id/approve", authenticateToken, async (req, res) => {
  try {
    const batch = await Batch.findById(req.params.id);
    if (!batch) {
      return res.status(404).json({ message: "Batch not found" });
    }

    if (batch.status === "active") {
      return res.status(400).json({ message: "Batch is already active" });
    }

    // Only allow approve if batch has passed quality check
    if (!batch.qualityCheck || batch.qualityCheck.passed !== true) {
      return res
        .status(400)
        .json({ message: "Batch must pass quality check before approval." });
    }

    batch.status = "active";
    batch.approvedBy = req.user.id;
    batch.approvedAt = new Date();

    await batch.save();

    // Bổ sung: Tạo StockMovement khi approve batch
    const stockMovement = new StockMovement({
      movementType: "in",
      reason: "purchase",
      productId: batch.productId,
      batchId: batch._id,
      quantity: batch.quantity,
      unitCost: batch.unitCost,
      totalValue: batch.quantity * batch.unitCost,
      reference: batch.batchCode,
      referenceId: batch._id,
      referenceModel: "Batch",
      location: batch.location,
      notes: `Nhập kho lô hàng ${batch.batchCode}`,
      performedBy: req.user.id,
      status: "completed",
    });
    await stockMovement.save();

    // Bổ sung: Cập nhật tồn kho sản phẩm
    await Product.findByIdAndUpdate(batch.productId, {
      $inc: { stockQuantity: batch.quantity },
    });

    const updatedBatch = await Batch.findById(batch._id).populate(
      "productId supplierId createdBy approvedBy"
    );

    res.json({
      message: "Batch approved successfully",
      batch: updatedBatch,
    });
  } catch (error) {
    console.error("Error approving batch:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * @swagger
 * /api/batches/expiring-soon:
 *   get:
 *     summary: Get batches expiring soon
 *     tags: [Inventory Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 30
 *         description: Number of days to consider as expiring soon
 *     responses:
 *       200:
 *         description: List of expiring soon batches
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
// GET /api/batches/expiring-soon - Lấy lô hàng sắp hết hạn
router.get("/expiring-soon", authenticateToken, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + parseInt(days));

    const batches = await Batch.find({
      expiryDate: { $lte: targetDate, $gte: new Date() },
      remainingQuantity: { $gt: 0 },
    })
      .populate("productId", "name category brand")
      .populate("supplierId", "name code")
      .sort({ expiryDate: 1 });

    res.json({ batches });
  } catch (error) {
    console.error("Error fetching expiring batches:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * @swagger
 * /api/batches/expired:
 *   get:
 *     summary: Get expired batches
 *     tags: [Inventory Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of expired batches
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
// GET /api/batches/expired - Lấy lô hàng đã hết hạn
router.get("/expired", authenticateToken, async (req, res) => {
  try {
    const batches = await Batch.find({
      expiryDate: { $lt: new Date() },
      remainingQuantity: { $gt: 0 },
    })
      .populate("productId", "name category brand")
      .populate("supplierId", "name code")
      .sort({ expiryDate: 1 });

    res.json({ batches });
  } catch (error) {
    console.error("Error fetching expired batches:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * @swagger
 * /api/batches/{id}/dispose:
 *   post:
 *     summary: Dispose a batch (reduce inventory)
 *     tags: [Inventory Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Batch ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               quantity:
 *                 type: number
 *               reason:
 *                 type: string
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Batch disposal recorded successfully
 *       400:
 *         description: Disposal quantity exceeds remaining quantity
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Batch not found
 *       500:
 *         description: Internal server error
 */
// POST /api/batches/:id/dispose - Thanh lý lô hàng
router.post("/:id/dispose", authenticateToken, async (req, res) => {
  try {
    const { quantity, reason, notes } = req.body;

    const batch = await Batch.findById(req.params.id);
    if (!batch) {
      return res.status(404).json({ message: "Batch not found" });
    }

    if (quantity > batch.remainingQuantity) {
      return res.status(400).json({
        message: "Disposal quantity exceeds remaining quantity",
      });
    }

    // Update batch remaining quantity
    batch.remainingQuantity -= quantity;
    if (batch.remainingQuantity === 0) {
      batch.status = "disposed";
    }

    await batch.save();

    // Create stock movement for disposal
    const stockMovement = new StockMovement({
      movementType: "disposal",
      productId: batch.productId,
      batchId: batch._id,
      quantity: -quantity, // Negative for disposal
      unitCost: batch.unitCost,
      reason: "disposal",
      reference: batch.batchCode,
      referenceId: batch._id,
      referenceModel: "Batch",
      location: batch.location,
      notes: `Thanh lý lô hàng ${batch.batchCode}: ${reason}. ${notes || ""}`,
      performedBy: req.user.id,
      status: "completed",
    });

    await stockMovement.save();

    // Update product stock quantity
    await Product.findByIdAndUpdate(batch.productId, {
      $inc: { stockQuantity: -quantity },
    });

    res.json({
      message: "Batch disposal recorded successfully",
      remainingQuantity: batch.remainingQuantity,
    });
  } catch (error) {
    console.error("Error disposing batch:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;
