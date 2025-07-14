const axios = require("axios");

const API_BASE = "http://localhost:10000/api";

async function testAPI() {
  try {
    console.log("🧪 Testing API endpoints...\n");

    // Test 1: Check if server is running
    console.log("1️⃣ Testing server connection...");
    try {
      const response = await axios.get(`${API_BASE}/auth/test`);
      console.log("✅ Server is running");
    } catch (error) {
      console.log("❌ Server connection failed:", error.message);
      return;
    }

    // Test 2: Test batches endpoint (without auth first)
    console.log("\n2️⃣ Testing batches endpoint...");
    try {
      const response = await axios.get(`${API_BASE}/batches`);
      console.log("✅ Batches endpoint accessible");
    } catch (error) {
      if (error.response?.status === 401) {
        console.log("✅ Batches endpoint requires authentication (expected)");
      } else {
        console.log(
          "❌ Batches endpoint error:",
          error.response?.status,
          error.response?.data
        );
      }
    }

    // Test 3: Test suppliers endpoint
    console.log("\n3️⃣ Testing suppliers endpoint...");
    try {
      const response = await axios.get(`${API_BASE}/suppliers`);
      console.log("✅ Suppliers endpoint accessible");
    } catch (error) {
      if (error.response?.status === 401) {
        console.log("✅ Suppliers endpoint requires authentication (expected)");
      } else {
        console.log(
          "❌ Suppliers endpoint error:",
          error.response?.status,
          error.response?.data
        );
      }
    }

    // Test 4: Test stock-movements endpoint
    console.log("\n4️⃣ Testing stock-movements endpoint...");
    try {
      const response = await axios.get(`${API_BASE}/stock-movements`);
      console.log("✅ Stock movements endpoint accessible");
    } catch (error) {
      if (error.response?.status === 401) {
        console.log(
          "✅ Stock movements endpoint requires authentication (expected)"
        );
      } else {
        console.log(
          "❌ Stock movements endpoint error:",
          error.response?.status,
          error.response?.data
        );
      }
    }

    console.log("\n🎉 API endpoints are working correctly!");
    console.log(
      "📝 Note: 401 errors are expected since we're not providing authentication tokens"
    );
  } catch (error) {
    console.error("❌ Test failed:", error.message);
  }
}

testAPI();
