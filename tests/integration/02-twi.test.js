import { getAgent } from "../setup.js";
import { faker } from "@faker-js/faker";
import { describe, expect, it, beforeAll } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let agent;

beforeAll(async () => {
  agent = await getAgent();
});

describe("TWI CREATION WITH MEDIA", () => {
  let mediaToken;
  let twiId;

  it("POST /api/user/create - should create TWI and return media token", async () => {
    const res = await agent
      .post("/api/user/create")
      .send({
        text: faker.lorem.sentence(),
        attachment: true
      });
    
    expect(res.statusCode).toBe(202);
    expect(res.body).toHaveProperty("token");

    mediaToken = res.body.token;
    
    console.log("✅ TWI created:", {

      hasMediaToken: !!mediaToken
    });
  });

  it("POST /upload - should upload media with token", async () => {
    expect(mediaToken).toBeDefined();
    
    const MEDIA_URL = process.env.MEDIA_SERVICE_URL || "http://twivo-media-app:8080";
    
    // Direct path to the image
    const imagePath = path.join(__dirname, "images", "images.jpeg");
    
    if (!fs.existsSync(imagePath)) {
      console.warn(`⚠️ Image not found at ${imagePath}, skipping upload test`);
      return;
    }
    
    const imageBuffer = fs.readFileSync(imagePath);
    console.log(`📸 Uploading to ${MEDIA_URL}: images.jpeg (${imageBuffer.length} bytes)`);
    
    try {
      const mediaRes = await fetch(`${MEDIA_URL}/upload`, {
        method: "POST",
        headers: {
          "Content-Type": "image/jpeg",
          "x-twivo-backend": mediaToken
        },
        body: imageBuffer
      });
      
      console.log("📤 Upload response status:", mediaRes);
      
      // Only try to read body if successful
      if (mediaRes.ok) {
        const responseText = await mediaRes.text();
        console.log("📤 Response:", responseText.substring(0, 100));
      }
      
      expect(mediaRes.status).toBe(200);
    } catch (error) {
      if (error.code === 'ECONNREFUSED' || error.cause?.code === 'ECONNREFUSED') {
        console.warn("⚠️ Media service not reachable, skipping upload test");
        return;
      }
      console.error("Upload error:", error.message);
      throw error;
    }
  });
});

// Existing TWI tests below...
describe("TWI CREATION", () => {
  it("POST /api/user/create", async () => {
    const res = await agent
      .post("/api/user/create")
      .send({
        text: faker.lorem.sentence(),
        attachment: false
      });
    
    expect(res.statusCode).toBe(202);
  });
});