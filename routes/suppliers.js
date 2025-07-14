const express = require("express");
const router = express.Router();
const Supplier = require("../models/Supplier");
const Batch = require("../models/Batch");
const { authenticateToken } = require("../middleware/auth");

/**
 * @swagger
 * components:
 *   schemas:
 *     Supplier:
 *       type: object
 *       required:
 *         - name
 *         - code
 *         - contactPerson
 *         - email
 *         - phone
 *         - address
 *         - city
 *         - country
 *       properties:
 *         _id:
 *           type: string
 *           description: Supplier ID
 *         name:
 *           type: string
 *           description: Supplier name
 *         code:
 *           type: string
 *           description: Unique supplier code
 *         contactPerson:
 *           type: string
 *           description: Contact person name
 *         email:
 *           type: string
 *           format: email
 *           description: Contact email
 *         phone:
 *           type: string
 *           description: Contact phone number
 *         address:
 *           type: string
 *           description: Full address
 *         city:
 *           type: string
 *           description: City
 *         country:
 *           type: string
 *           description: Country
 *         taxCode:
 *           type: string
 *           description: Tax identification number
 *         website:
 *           type: string
 *           description: Company website
 *         status:
 *           type: string
 *           enum: [active, inactive, suspended]
 *           description: Supplier status
 *         rating:
 *           type: number
 *           minimum: 1
 *           maximum: 5
 *           description: Supplier rating
 *         totalOrders:
 *           type: number
 *           description: Total number of purchase orders (batches) from this supplier
 *         totalValue:
 *           type: number
 *           description: Total value of all purchase orders (batches) from this supplier
 *         paymentTerms:
 *           type: string
 *           description: Payment terms
 *         notes:
 *           type: string
 *           description: Additional notes
 *         createdBy:
 *           type: string
 *           description: Staff ID who created the supplier
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/suppliers:
 *   get:
 *     summary: Get all suppliers with pagination and filtering
 *     tags: [Supplier Management]
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
 *           enum: [active, inactive, suspended]
 *         description: Filter by supplier status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name, code, or contact person
 *     responses:
 *       200:
 *         description: List of suppliers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 suppliers:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Supplier'
 *                 totalPages:
 *                   type: integer
 *                 currentPage:
 *                   type: integer
 *                 total:
 *                   type: integer
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 *   post:
 *     summary: Create new supplier
 *     tags: [Supplier Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Supplier'
 *     responses:
 *       201:
 *         description: Supplier created successfully
 *       400:
 *         description: Bad request - validation error
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
// GET /api/suppliers - Lấy danh sách nhà cung cấp
router.get("/", authenticateToken, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      search,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const query = {};

    // Filter by status
    if (status) {
      query.status = status;
    }

    // Search by name, code, or contact person
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { code: { $regex: search, $options: "i" } },
        { contactPerson: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === "desc" ? -1 : 1;

    const suppliers = await Supplier.find(query)
      .populate("createdBy", "name email")
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const total = await Supplier.countDocuments(query);

    res.json({
      suppliers,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (error) {
    console.error("Error fetching suppliers:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * @swagger
 * /api/suppliers/{id}:
 *   get:
 *     summary: Get supplier details
 *     tags: [Supplier Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Supplier ID
 *     responses:
 *       200:
 *         description: Supplier details
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Supplier not found
 *       500:
 *         description: Internal server error
 *   put:
 *     summary: Update supplier
 *     tags: [Supplier Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Supplier ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Supplier'
 *     responses:
 *       200:
 *         description: Supplier updated successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Supplier not found
 *       500:
 *         description: Internal server error
 *   delete:
 *     summary: Delete supplier
 *     tags: [Supplier Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Supplier ID
 *     responses:
 *       200:
 *         description: Supplier deleted successfully
 *       400:
 *         description: Cannot delete supplier with active batches
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Supplier not found
 *       500:
 *         description: Internal server error
 */
// GET /api/suppliers/:id - Lấy chi tiết nhà cung cấp
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id).populate(
      "createdBy",
      "name email"
    );

    if (!supplier) {
      return res.status(404).json({ message: "Supplier not found" });
    }

    // Get batches from this supplier
    const batches = await Batch.find({ supplierId: supplier._id })
      .populate("productId", "name category brand")
      .sort({ createdAt: -1 })
      .limit(10);

    // Calculate supplier statistics
    const totalBatches = await Batch.countDocuments({
      supplierId: supplier._id,
    });
    const activeBatches = await Batch.countDocuments({
      supplierId: supplier._id,
      status: "active",
    });
    const totalValue = await Batch.aggregate([
      { $match: { supplierId: supplier._id } },
      { $group: { _id: null, total: { $sum: "$totalCost" } } },
    ]);

    const statistics = {
      totalBatches,
      activeBatches,
      totalValue: totalValue.length > 0 ? totalValue[0].total : 0,
    };

    res.json({
      supplier,
      batches,
      statistics,
    });
  } catch (error) {
    console.error("Error fetching supplier:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * @swagger
 * /api/suppliers:
 *   post:
 *     summary: Create new supplier
 *     tags: [Supplier Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - contactPerson
 *               - email
 *               - phone
 *               - address
 *               - city
 *               - country
 *             properties:
 *               name:
 *                 type: string
 *                 description: Supplier name
 *               code:
 *                 type: string
 *                 description: Supplier code (auto-generated if not provided)
 *               contactPerson:
 *                 type: string
 *                 description: Contact person name
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Contact email
 *               phone:
 *                 type: string
 *                 description: Contact phone number
 *               address:
 *                 type: string
 *                 description: Full address
 *               city:
 *                 type: string
 *                 description: City
 *               country:
 *                 type: string
 *                 description: Country
 *               taxCode:
 *                 type: string
 *                 description: Tax identification number
 *               website:
 *                 type: string
 *                 description: Company website
 *               paymentTerms:
 *                 type: string
 *                 default: "30 days"
 *                 description: Payment terms
 *               notes:
 *                 type: string
 *                 description: Additional notes
 *     responses:
 *       201:
 *         description: Supplier created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: string
 *       400:
 *         description: Bad request - validation error
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
// POST /api/suppliers - Tạo nhà cung cấp mới
router.post("/", authenticateToken, async (req, res) => {
  try {
    const {
      name,
      contactPerson,
      email,
      phone,
      address,
      city,
      country,
      taxCode,
      website,
      paymentTerms,
      notes,
    } = req.body;

    // Validate required fields
    if (
      !name ||
      !contactPerson ||
      !email ||
      !phone ||
      !address ||
      !city ||
      !country
    ) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Check if email already exists
    const existingSupplier = await Supplier.findOne({ email });
    if (existingSupplier) {
      return res.status(400).json({ message: "Email already exists" });
    }

    // Generate supplier code
    const code = await Supplier.generateSupplierCode();

    const supplier = new Supplier({
      name,
      code,
      contactPerson,
      email,
      phone,
      address,
      city,
      country,
      taxCode,
      website,
      paymentTerms,
      notes,
      createdBy: req.user.id,
    });

    await supplier.save();

    const populatedSupplier = await Supplier.findById(supplier._id).populate(
      "createdBy",
      "name email"
    );

    res.status(201).json({
      message: "Supplier created successfully",
      supplier: populatedSupplier,
    });
  } catch (error) {
    console.error("Error creating supplier:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * @swagger
 * /api/suppliers/{id}:
 *   put:
 *     summary: Update supplier
 *     tags: [Supplier Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Supplier ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - contactPerson
 *               - email
 *               - phone
 *               - address
 *               - city
 *               - country
 *             properties:
 *               name:
 *                 type: string
 *                 description: Supplier name
 *               code:
 *                 type: string
 *                 description: Supplier code (auto-generated if not provided)
 *               contactPerson:
 *                 type: string
 *                 description: Contact person name
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Contact email
 *               phone:
 *                 type: string
 *                 description: Contact phone number
 *               address:
 *                 type: string
 *                 description: Full address
 *               city:
 *                 type: string
 *                 description: City
 *               country:
 *                 type: string
 *                 description: Country
 *               taxCode:
 *                 type: string
 *                 description: Tax identification number
 *               website:
 *                 type: string
 *                 description: Company website
 *               status:
 *                 type: string
 *                 enum: [active, inactive, suspended]
 *                 description: Supplier status
 *               paymentTerms:
 *                 type: string
 *                 description: Payment terms
 *               notes:
 *                 type: string
 *                 description: Additional notes
 *     responses:
 *       200:
 *         description: Supplier updated successfully
 *       400:
 *         description: Bad request - validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Supplier not found
 *       500:
 *         description: Internal server error
 */
// PUT /api/suppliers/:id - Cập nhật nhà cung cấp
router.put("/:id", authenticateToken, async (req, res) => {
  try {
    const {
      name,
      contactPerson,
      email,
      phone,
      address,
      city,
      country,
      taxCode,
      website,
      status,
      paymentTerms,
      notes,
    } = req.body;

    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) {
      return res.status(404).json({ message: "Supplier not found" });
    }

    // Check if email already exists (if changed)
    if (email && email !== supplier.email) {
      const existingSupplier = await Supplier.findOne({ email });
      if (existingSupplier) {
        return res.status(400).json({ message: "Email already exists" });
      }
    }

    const updateData = {};
    if (name) updateData.name = name;
    if (contactPerson) updateData.contactPerson = contactPerson;
    if (email) updateData.email = email;
    if (phone) updateData.phone = phone;
    if (address) updateData.address = address;
    if (city) updateData.city = city;
    if (country) updateData.country = country;
    if (taxCode !== undefined) updateData.taxCode = taxCode;
    if (website !== undefined) updateData.website = website;
    if (status) updateData.status = status;
    if (paymentTerms !== undefined) updateData.paymentTerms = paymentTerms;
    if (notes !== undefined) updateData.notes = notes;

    const updatedSupplier = await Supplier.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).populate("createdBy", "name email");

    res.json({
      message: "Supplier updated successfully",
      supplier: updatedSupplier,
    });
  } catch (error) {
    console.error("Error updating supplier:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * @swagger
 * /api/suppliers/{id}:
 *   delete:
 *     summary: Delete supplier
 *     tags: [Supplier Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Supplier ID
 *     responses:
 *       200:
 *         description: Supplier deleted successfully
 *       400:
 *         description: Cannot delete supplier with active batches
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Supplier not found
 *       500:
 *         description: Internal server error
 */
// DELETE /api/suppliers/:id - Xóa nhà cung cấp
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) {
      return res.status(404).json({ message: "Supplier not found" });
    }

    // Check if supplier has active batches
    const activeBatches = await Batch.countDocuments({
      supplierId: supplier._id,
      remainingQuantity: { $gt: 0 },
    });

    if (activeBatches > 0) {
      return res.status(400).json({
        message: "Cannot delete supplier with active batches",
      });
    }

    await Supplier.findByIdAndDelete(req.params.id);

    res.json({ message: "Supplier deleted successfully" });
  } catch (error) {
    console.error("Error deleting supplier:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * @swagger
 * /api/suppliers/{id}/batches:
 *   get:
 *     summary: Get batches of a supplier
 *     tags: [Supplier Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Supplier ID
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
 *         description: Filter by batch status
 *     responses:
 *       200:
 *         description: List of batches for supplier
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Supplier not found
 *       500:
 *         description: Internal server error
 */
// GET /api/suppliers/:id/batches - Lấy danh sách lô hàng của nhà cung cấp
router.get("/:id/batches", authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;

    const query = { supplierId: req.params.id };

    if (status) {
      query.status = status;
    }

    const batches = await Batch.find(query)
      .populate("productId", "name category brand")
      .sort({ createdAt: -1 })
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
    console.error("Error fetching supplier batches:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * @swagger
 * /api/suppliers/active:
 *   get:
 *     summary: Get all active suppliers
 *     tags: [Supplier Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of active suppliers
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
// GET /api/suppliers/active - Lấy danh sách nhà cung cấp đang hoạt động
router.get("/active", authenticateToken, async (req, res) => {
  try {
    const suppliers = await Supplier.find({ status: "active" })
      .select("name code contactPerson email phone")
      .sort({ name: 1 });

    res.json({ suppliers });
  } catch (error) {
    console.error("Error fetching active suppliers:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * @swagger
 * /api/suppliers/{id}/rating:
 *   put:
 *     summary: Rate a supplier
 *     tags: [Supplier Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Supplier ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - rating
 *             properties:
 *               rating:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 5
 *                 description: Rating (1-5)
 *               note:
 *                 type: string
 *                 description: Optional note for the rating
 *     responses:
 *       200:
 *         description: Supplier rated successfully
 *       400:
 *         description: Bad request - rating must be between 1 and 5
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Supplier not found
 *       500:
 *         description: Internal server error
 */
// Đánh giá supplier
router.put("/:id/rating", authenticateToken, async (req, res) => {
  try {
    const { rating, note } = req.body;
    if (!rating || rating < 1 || rating > 5) {
      return res
        .status(400)
        .json({ message: "Rating must be between 1 and 5" });
    }
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) {
      return res.status(404).json({ message: "Supplier not found" });
    }
    supplier.rating = rating;
    // Nếu muốn lưu lịch sử đánh giá, có thể push vào mảng reviews ở đây
    await supplier.save();
    res.json({ message: "Supplier rated successfully", supplier });
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;
