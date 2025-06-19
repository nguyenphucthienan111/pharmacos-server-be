/**
 * @swagger
 * components:
 *   schemas:
 *     Favorite:
 *       type: object
 *       required:
 *         - user
 *         - product
 *       properties:
 *         user:
 *           type: string
 *           description: ID của khách hàng
 *         product:
 *           type: string
 *           description: ID của sản phẩm
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Thời gian tạo
 */

/**
 * @swagger
 * /api/favorites:
 *   get:
 *     summary: Lấy danh sách sản phẩm yêu thích của user
 *     tags: [Favorites]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Favorite'
 *       401:
 *         description: Chưa đăng nhập
 *       500:
 *         description: Lỗi server
 */

/**
 * @swagger
 * /api/favorites/{productId}:
 *   post:
 *     summary: Thêm sản phẩm vào mục yêu thích
 *     tags: [Favorites]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của sản phẩm
 *     responses:
 *       201:
 *         description: Thêm thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/Favorite'
 *       400:
 *         description: Sản phẩm đã tồn tại trong mục yêu thích
 *       401:
 *         description: Chưa đăng nhập
 *       500:
 *         description: Lỗi server
 *   delete:
 *     summary: Xóa sản phẩm khỏi mục yêu thích
 *     tags: [Favorites]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của sản phẩm
 *     responses:
 *       200:
 *         description: Xóa thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       401:
 *         description: Chưa đăng nhập
 *       404:
 *         description: Không tìm thấy sản phẩm trong mục yêu thích
 *       500:
 *         description: Lỗi server
 */

const express = require("express");
const router = express.Router();
const Favorite = require("../models/Favorite");
const { authenticateToken, authorize } = require("../middleware/auth");

// Thêm sản phẩm vào favorites
router.post(
  "/:productId",
  authenticateToken,
  authorize(["customer"]),
  async (req, res) => {
    try {
      const favorite = new Favorite({
        user: req.user.id,
        product: req.params.productId,
      });

      await favorite.save();
      res.status(201).json({
        success: true,
        message: "Sản phẩm đã được thêm vào mục yêu thích",
        data: favorite,
      });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(400).json({
          success: false,
          message: "Sản phẩm đã tồn tại trong mục yêu thích",
        });
      }
      res.status(500).json({
        success: false,
        message: "Lỗi server",
        error: error.message,
      });
    }
  }
);

// Xóa sản phẩm khỏi favorites
router.delete(
  "/:productId",
  authenticateToken,
  authorize(["customer"]),
  async (req, res) => {
    try {
      const favorite = await Favorite.findOneAndDelete({
        user: req.user.id,
        product: req.params.productId,
      });

      if (!favorite) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy sản phẩm trong mục yêu thích",
        });
      }

      res.status(200).json({
        success: true,
        message: "Đã xóa sản phẩm khỏi mục yêu thích",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Lỗi server",
        error: error.message,
      });
    }
  }
);

// Lấy danh sách favorites của user
router.get(
  "/",
  authenticateToken,
  authorize(["customer"]),
  async (req, res) => {
    try {
      const favorites = await Favorite.find({ user: req.user.id })
        .populate("product")
        .sort({ createdAt: -1 });

      res.status(200).json({
        success: true,
        data: favorites,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Lỗi server",
        error: error.message,
      });
    }
  }
);

module.exports = router;
