const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const Account = require("../models/Account");
const { auth } = require("./firebase");
const { signInWithCredential, GoogleAuthProvider } = require("firebase/auth");

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await Account.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        // Tìm tài khoản trong database
        let user = await Account.findOne({ email: profile.emails[0].value });

        if (!user) {
          // Tạo credential từ access token
          const credential = GoogleAuthProvider.credential(null, accessToken);

          // Đăng nhập vào Firebase
          const firebaseResult = await signInWithCredential(auth, credential);

          // Tạo tài khoản mới nếu chưa tồn tại
          user = await Account.create({
            email: profile.emails[0].value,
            fullname: profile.displayName,
            googleId: profile.id,
            avatar: profile.photos[0].value,
            firebaseUid: firebaseResult.user.uid,
            status: "active",
            role: "customer",
          });
        }

        return done(null, user);
      } catch (error) {
        return done(error, null);
      }
    }
  )
);

module.exports = passport;
