const nodemailer = require("nodemailer");
const crypto = require("crypto");

// Generate verification token
const generateVerificationToken = () => {
  return crypto.randomBytes(32).toString("hex");
};

// Send verification email
const sendVerificationEmail = async (email, verificationToken) => {
  // In development mode, skip email sending and return true
  if (process.env.NODE_ENV === "development") {
    console.log("Development mode: Email sending skipped");
    console.log("Verification would have been sent to:", email);
    console.log("Verification token:", verificationToken);
    console.log(
      "Verification URL would be:",
      `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`
    );
    return true;
  }

  // Production mode email sending
  try {
    // Create transporter for production
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;

    const mailOptions = {
      from: {
        name: "Pharmacos Manager",
        address: process.env.EMAIL_USER,
      },
      to: email,
      subject: "Verify Your Email - Pharmacos Manager",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #007bff;">Welcome to Pharmacos Manager!</h2>
          <p>Thank you for registering. Please click the button below to verify your email address:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}" 
               style="background-color: #007bff; 
                      color: white; 
                      padding: 12px 30px; 
                      text-decoration: none; 
                      border-radius: 5px; 
                      font-weight: bold;">
              Verify Email
            </a>
          </div>
          <p>Or copy and paste this URL into your browser:</p>
          <p style="color: #666; word-break: break-all;">${verificationUrl}</p>
          <p>This link will expire in 24 hours.</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error("Email service error:", error);
    return false;
  }
};

module.exports = {
  generateVerificationToken,
  sendVerificationEmail,
};
