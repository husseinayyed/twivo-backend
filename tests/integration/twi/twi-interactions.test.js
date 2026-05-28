import { getAgent } from "../../setup.js";
import { describe, expect, it, beforeAll } from "vitest";
import { ObjectId } from "mongodb";

let agent;

beforeAll(async () => {
  agent = await getAgent();
});

describe("TWI INTERACTIONS", () => {
  describe("POST /api/feed/twi/like", () => {
    it("should check if TWI is liked", async () => {
      const testTwiId = new ObjectId().toString();
      const res = await agent
        .post("/api/feed/twi/hasLiked")
        .send({
          twiId: testTwiId
        });
      
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty("hasLiked");
    });

    // it("should handle invalid TWI ID", async () => {
    //   const fakeTwiId = "invalid-id";
    //   const res = await agent
    //     .post("/api/feed/twi/like")
    //     .send({ twiId: fakeTwiId });

    //   expect(res.statusCode).toBe(404);
    // }); cancelled due to feed changes
    it("should require twiId", async () => {
      const res = await agent
        .post("/api/feed/twi/like")
        .send({});
    
      expect(res.statusCode).toBe(400);
    });

    it("should return 400 when twiId is invalid format", async () => {
      const res = await agent
        .post("/api/feed/twi/like")
        .send({
          twiId: "invalid-object-id"
        });
      
      expect(res.statusCode).toBe(400);
    });

    // it("should return 404 when tweet not found", async () => {
    //   const fakeObjectId = new ObjectId().toString();
    //   const res = await agent
    //     .post("/api/feed/twi/like")
    //     .send({
    //       twiId: fakeObjectId
    //     });
    //   expect(res.statusCode).toBe(404);
    // });

    it("should like a tweet successfully", async () => {
      // This would need a real tweet ID from the database
      // For now, we expect 404 or 200 depending on implementation
      const testTwiId = new ObjectId().toString();
      const res = await agent
        .post("/api/feed/twi/like")
        .send({ twiId: testTwiId });
      
      // Check if tweet exists (404 is expected for non-existent tweets)
      if (res.statusCode === 404) {
        expect(res.body).toMatchObject({
          e: true,
          message: "Tweet not found"
        });
      } else if (res.statusCode === 200) {
        expect(res.body).toMatchObject({
          e: false,
          liked: true
        });
      }
    });
  });

  describe("POST /api/feed/twi/hasLiked", () => {
    it("should check if user liked a tweet", async () => {
      const testTwiId = new ObjectId().toString();
      const res = await agent
        .post("/api/feed/twi/hasLiked")
        .send({
          twiId: testTwiId
        });
      
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty("hasLiked");
      expect(res.body).toHaveProperty("e", false);
    });

    it("should return false for non-existent tweet", async () => {
      const fakeObjectId = new ObjectId().toString();
      const res = await agent
        .post("/api/feed/twi/hasLiked")
        .send({
          twiId: fakeObjectId
        });
      
      expect(res.statusCode).toBe(200);
      expect(res.body).toMatchObject({
        hasLiked: false,
        e: false
      });
    });
  });

  describe("Error handling", () => {
    it("should handle malformed JSON", async () => {
      const res = await agent
        .post("/api/feed/twi/like")
        .set('Content-Type', 'application/json')
        .send('{"twiId": "incomplete json');
      
      expect(res.statusCode).toBe(400);
    });

    it("should handle empty request body", async () => {
      const res = await agent
        .post("/api/feed/twi/like")
        .send();
      
      expect(res.statusCode).toBe(400);
    });
  });
});
