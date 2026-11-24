import dotenv from "dotenv";
dotenv.config({ path: new URL("../../.env", import.meta.url) });
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import User from "../models/user.model.js";
import { hashPassword } from "../utils/password.utils.js";

async function seedAdmin() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PROD_ADMIN_SEED !== "true") {
    console.error("[seed:admin] Refusing to run in production mode without explicit ALLOW_PROD_ADMIN_SEED=true.");
    process.exit(1);
  }

  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminName = process.env.ADMIN_NAME?.trim() || "Admin User";

  if (!adminEmail || !adminPassword) {
    console.error(
      "[seed:admin] Error: Both ADMIN_EMAIL and ADMIN_PASSWORD must be configured in your server/.env file."
    );
    process.exit(1);
  }

  if (adminPassword.length < 8) {
    console.error("[seed:admin] Error: ADMIN_PASSWORD must be at least 8 characters long.");
    process.exit(1);
  }

  try {
    await connectDB();

    // Check if account already exists
    const existingUser = await User.findOne({ email: adminEmail });

    if (existingUser) {
      if (existingUser.role === "ADMIN") {
        console.log(
          `[seed:admin] Admin account already exists for "${adminEmail}" (Role: ADMIN). No changes made.`
        );
        await mongoose.connection.close();
        process.exit(0);
      } else {
        console.error(
          `[seed:admin] An account already exists for "${adminEmail}" but has role "${existingUser.role}". Refusing to modify existing user role.`
        );
        await mongoose.connection.close();
        process.exit(1);
      }
    }

    // Hash the password with bcrypt (never plaintext)
    const passwordHash = await hashPassword(adminPassword);

    // Create the admin account
    const newAdmin = await User.create({
      name: adminName,
      email: adminEmail,
      passwordHash,
      role: "ADMIN",
    });

    console.log(
      `[seed:admin] Successfully created Admin account for "${newAdmin.email}" (Role: ADMIN, ID: ${newAdmin._id}).`
    );

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error(`[seed:admin] Execution error: ${error.message}`);
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
    process.exit(1);
  }
}

seedAdmin();
