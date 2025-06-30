const express = require("express");
const router = express.Router();
const Blog = require("../models/Blog");
const { authorize, authenticateToken } = require("../middleware/auth");

/**
 * @swagger
 * /api/blogs:
 *   get:
 *     summary: Get all visible blogs (public)
 *     tags: [Blogs]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: List of blogs retrieved successfully
 */
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const blogs = await Blog.find({ isVisible: true })
      .populate("author", "username")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Blog.countDocuments({ isVisible: true });

    res.json({
      success: true,
      data: {
        blogs,
        pagination: {
          total,
          totalPages: Math.ceil(total / limit),
          currentPage: page,
          limit,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching blogs",
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /api/blogs/admin:
 *   get:
 *     summary: Get all blogs (admin only, including hidden blogs)
 *     tags: [Blogs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: List of all blogs retrieved successfully
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized
 */
router.get(
  "/admin",
  [authenticateToken, authorize(["admin"])],
  async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;

      const blogs = await Blog.find()
        .populate("author", "username")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit);

      const total = await Blog.countDocuments();

      res.json({
        success: true,
        data: {
          blogs,
          pagination: {
            total,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            limit,
          },
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error fetching blogs",
        error: error.message,
      });
    }
  }
);

/**
 * @swagger
 * /api/blogs/{id}:
 *   get:
 *     summary: Get blog by ID
 *     tags: [Blogs]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Blog retrieved successfully
 *       404:
 *         description: Blog not found
 */
router.get("/:id", async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id).populate(
      "author",
      "username"
    );

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: "Blog not found",
      });
    }

    // Nếu blog không visible và người dùng không phải admin thì không cho xem
    if (!blog.isVisible && (!req.user || req.user.role !== "admin")) {
      return res.status(404).json({
        success: false,
        message: "Blog not found",
      });
    }

    // Tăng số lượt xem
    blog.viewCount += 1;
    await blog.save();

    res.json({
      success: true,
      data: blog,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching blog",
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /api/blogs:
 *   post:
 *     summary: Create new blog (admin only)
 *     tags: [Blogs]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - content
 *               - thumbnail
 *               - category
 *             properties:
 *               title:
 *                 type: string
 *               content:
 *                 type: string
 *               thumbnail:
 *                 type: string
 *               category:
 *                 type: string
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *               isVisible:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Blog created successfully
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized
 */
router.post(
  "/",
  [authenticateToken, authorize(["admin"])],
  async (req, res) => {
    try {
      const blog = new Blog({
        ...req.body,
        author: req.user.id,
      });

      await blog.save();
      await blog.populate("author", "username");

      res.status(201).json({
        success: true,
        data: blog,
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: "Error creating blog",
        error: error.message,
      });
    }
  }
);

/**
 * @swagger
 * /api/blogs/{id}:
 *   patch:
 *     summary: Update blog (admin only)
 *     tags: [Blogs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               content:
 *                 type: string
 *               thumbnail:
 *                 type: string
 *               category:
 *                 type: string
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *               isVisible:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Blog updated successfully
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Blog not found
 */
router.patch(
  "/:id",
  [authenticateToken, authorize(["admin"])],
  async (req, res) => {
    try {
      const blog = await Blog.findById(req.params.id);

      if (!blog) {
        return res.status(404).json({
          success: false,
          message: "Blog not found",
        });
      }

      const allowedUpdates = [
        "title",
        "content",
        "thumbnail",
        "category",
        "tags",
        "isVisible",
      ];

      const updates = {};
      Object.keys(req.body).forEach((key) => {
        if (allowedUpdates.includes(key)) {
          updates[key] = req.body[key];
        }
      });

      Object.assign(blog, updates);
      await blog.save();
      await blog.populate("author", "username");

      res.json({
        success: true,
        data: blog,
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: "Error updating blog",
        error: error.message,
      });
    }
  }
);

/**
 * @swagger
 * /api/blogs/{id}:
 *   delete:
 *     summary: Delete blog (admin only)
 *     tags: [Blogs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Blog deleted successfully
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Blog not found
 */
router.delete(
  "/:id",
  [authenticateToken, authorize(["admin"])],
  async (req, res) => {
    try {
      const blog = await Blog.findById(req.params.id);

      if (!blog) {
        return res.status(404).json({
          success: false,
          message: "Blog not found",
        });
      }

      await blog.deleteOne();

      res.json({
        success: true,
        message: "Blog deleted successfully",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error deleting blog",
        error: error.message,
      });
    }
  }
);

/**
 * @swagger
 * /api/blogs/{id}/toggle-visibility:
 *   patch:
 *     summary: Toggle blog visibility (admin only)
 *     tags: [Blogs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Blog visibility toggled successfully
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Blog not found
 */
router.patch(
  "/:id/toggle-visibility",
  [authenticateToken, authorize(["admin"])],
  async (req, res) => {
    try {
      const blog = await Blog.findById(req.params.id);

      if (!blog) {
        return res.status(404).json({
          success: false,
          message: "Blog not found",
        });
      }

      blog.isVisible = !blog.isVisible;
      await blog.save();
      await blog.populate("author", "username");

      res.json({
        success: true,
        data: blog,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error toggling blog visibility",
        error: error.message,
      });
    }
  }
);

module.exports = router;
