const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const Account = require("../models/Account");
const Customer = require("../models/Customer");
const SaleStaff = require("../models/SaleStaff");
const Admin = require("../models/Admin");
const {
  generateVerificationToken,
  sendVerificationEmail,
  sendResetPasswordEmail,
} = require("../utils/emailService");

/**
 * @swagger
 * components:
 *   schemas:
 *     RegisterInput:
 *       type: object
 *       required:
 *         - username
 *         - password
 *         - name
 *         - email
 *       properties:
 *         username:
 *           type: string
 *           description: Unique username for the account
 *         password:
 *           type: string
 *           description: Account password
 *         name:
 *           type: string
 *           description: Customer's full name
 *         email:
 *           type: string
 *           format: email
 *           description: Customer's email address
 *         gender:
 *           type: string
 *           enum: [male, female, other]
 *         dateOfBirth:
 *           type: string
 *           format: date
 */

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new customer account and send verification email
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterInput'
 *     responses:
 *       201:
 *         description: Registration successful, verification email sent
 *       400:
 *         description: Username/email already exists or invalid input
 *       500:
 *         description: Server error
 */
router.post("/register", async (req, res) => {
  try {
    const { username, password, name, email, gender, dateOfBirth, skinType } =
      req.body;

    // Check if username exists
    const existingAccount = await Account.findOne({ username });
    if (existingAccount) {
      return res.status(400).json({ message: "Username already exists" });
    }

    // Check for orphaned records
    const existingCustomer = await Customer.findOne({ email });
    const associatedAccount = existingCustomer
      ? await Account.findById(existingCustomer.accountId)
      : null;

    // If customer exists but no associated account, delete the orphaned customer record
    if (existingCustomer && !associatedAccount) {
      await Customer.findByIdAndDelete(existingCustomer._id);
    }
    // If both exist, return error
    else if (existingCustomer && associatedAccount) {
      return res.status(400).json({ message: "Email already registered" });
    }

    // Generate verification token
    const verificationToken = generateVerificationToken();
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Create unverified account
    const account = new Account({
      username,
      password,
      email,
      role: "customer",
      isVerified: false,
      verificationToken,
      verificationExpires,
    });
    await account.save();

    // Create customer profile
    const customer = new Customer({
      name,
      email,
      gender,
      dateOfBirth,
      accountId: account._id,
    });
    await customer.save();

    // Attempt to send verification email
    const emailSent = await sendVerificationEmail(email, verificationToken);

    // In development, allow registration even if email fails
    if (process.env.NODE_ENV === "development" && !emailSent) {
      // Set account as verified in development
      account.isVerified = true;
      await account.save();

      res.status(201).json({
        message:
          "Registration successful. Email verification skipped in development mode.",
        note: "Warning: Email service not configured. Account created as verified.",
      });
    } else if (!emailSent) {
      // In production, maintain strict email verification
      await Account.findByIdAndDelete(account._id);
      await Customer.findByIdAndDelete(customer._id);
      return res.status(500).json({
        message:
          "Failed to send verification email. Please check email configuration.",
      });
    } else {
      res.status(201).json({
        message:
          "Registration successful. Please check your email to verify your account.",
      });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/auth/verify-email:
 *   get:
 *     summary: Verify email address with token
 *     tags: [Authentication]
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Email verified successfully
 *       400:
 *         description: Invalid or expired token
 *       404:
 *         description: Account not found
 */
router.get("/verify-email", async (req, res) => {
  try {
    const { token } = req.query;

    const account = await Account.findOne({
      verificationToken: token,
      verificationExpires: { $gt: Date.now() },
    });

    if (!account) {
      return res.status(400).json({
        message: "Invalid or expired verification token",
      });
    }

    // Update account
    account.isVerified = true;
    account.verificationToken = undefined;
    account.verificationExpires = undefined;
    await account.save();

    res.json({ message: "Email verified successfully. You can now log in." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Authenticate user and get token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials or unverified email
 *       500:
 *         description: Server error
 */
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const account = await Account.findOne({ username });
    if (!account) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isValid = await account.comparePassword(password);
    if (!isValid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Check if account is locked
    if (account.status === "locked") {
      return res
        .status(401)
        .json({
          message: "Your account has been locked. Please contact support.",
        });
    }

    // Check if email is verified for customer accounts
    if (account.role === "customer" && !account.isVerified) {
      return res.status(401).json({
        message: "Please verify your email before logging in",
      });
    }

    let userProfile;
    switch (account.role) {
      case "customer":
        userProfile = await Customer.findOne({ accountId: account._id });
        break;
      case "staff":
        userProfile = await SaleStaff.findOne({ accountId: account._id });
        break;
      case "admin":
        userProfile = await Admin.findOne({ accountId: account._id });
        break;
    }

    const token = jwt.sign(
      {
        id: account._id,
        role: account.role,
        profileId: userProfile._id,
      },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({
      token,
      user: {
        id: account._id,
        username: account.username,
        role: account.role,
        profile: userProfile,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/auth/resend-verification:
 *   post:
 *     summary: Resend verification email
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Verification email sent
 *       400:
 *         description: Email not found or already verified
 *       500:
 *         description: Server error
 */
router.post("/resend-verification", async (req, res) => {
  try {
    const { email } = req.body;

    const customer = await Customer.findOne({ email });
    if (!customer) {
      return res.status(404).json({ message: "Email not found" });
    }

    const account = await Account.findById(customer.accountId);
    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }

    if (account.isVerified) {
      return res.status(400).json({ message: "Email already verified" });
    }

    // Generate new verification token
    const verificationToken = generateVerificationToken();
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    account.verificationToken = verificationToken;
    account.verificationExpires = verificationExpires;
    await account.save();

    // Send verification email
    const emailSent = await sendVerificationEmail(email, verificationToken);

    if (!emailSent) {
      return res
        .status(500)
        .json({ message: "Failed to send verification email" });
    }

    res.json({ message: "Verification email sent successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/auth/create-admin:
 *   post:
 *     summary: Create a new admin account
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *               - name
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *               name:
 *                 type: string
 *     responses:
 *       201:
 *         description: Admin account created successfully
 *       400:
 *         description: Username already exists or invalid input
 */
router.post("/create-admin", async (req, res) => {
  try {
    const { username, password, name } = req.body;

    // Check if username already exists
    const existingAccount = await Account.findOne({ username });
    if (existingAccount) {
      return res.status(400).json({
        message: "Username already exists",
      });
    }

    // Create admin account
    const account = new Account({
      username,
      password,
      role: "admin",
      isVerified: true, // Admin accounts are pre-verified
      status: "active",
    });
    await account.save();

    // Create admin profile
    const admin = new Admin({
      name,
      accountId: account._id,
    });
    await admin.save();

    res.status(201).json({
      message: "Admin account created successfully",
      admin: {
        username,
        name,
        role: "admin",
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Request password reset email
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Reset password email sent
 *       404:
 *         description: Account not found
 *       500:
 *         description: Server error
 */
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    // Find account by email
    const account = await Account.findOne({ email });
    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }

    // Generate reset token
    const resetToken = generateVerificationToken();
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Save reset token and expiry
    account.resetPasswordToken = resetToken;
    account.resetPasswordExpires = resetExpires;
    await account.save();

    // Send reset email
    const emailSent = await sendResetPasswordEmail(email, resetToken);

    if (!emailSent) {
      return res.status(500).json({ message: "Failed to send reset email" });
    }

    res.json({ message: "Password reset email sent successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     summary: Reset password using token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - newPassword
 *             properties:
 *               token:
 *                 type: string
 *               newPassword:
 *                 type: string
 *                 minLength: 6
 *     responses:
 *       200:
 *         description: Password reset successful
 *       400:
 *         description: Invalid or expired token
 *       500:
 *         description: Server error
 */
router.post("/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    // Find account with valid reset token
    const account = await Account.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!account) {
      return res.status(400).json({
        message: "Password reset token is invalid or has expired",
      });
    }

    // Update password and clear reset token
    account.password = newPassword;
    account.resetPasswordToken = undefined;
    account.resetPasswordExpires = undefined;
    await account.save();

    res.json({ message: "Password has been reset successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
