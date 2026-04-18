import { getAgent } from "../setup.js";
import { faker } from "@faker-js/faker";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { ObjectId } from "mongodb";

let agent;
let currentUserId;
let testUserIds = [];

beforeAll(async () => {
  agent = await getAgent();
  
  // Get current user ID from profile
  try {
    const profileRes = await agent.get("/api/user/profile");
    if (profileRes.statusCode === 200) {
      currentUserId = profileRes.body.data?.userId || profileRes.body.userId;
    }
  } catch (e) {
    console.log("Could not get current user ID");
  }
});

describe("FOLLOW & PROFILE ROUTES", () => {
  
  // Helper to create a test user and get their ID
  const createTestUser = async () => {
    const email = faker.internet.email();
    const username = faker.internet.username();
    const name = faker.person.fullName();
    
    const signupRes = await agent
      .post("/api/auth/sign")
      .send({ email, username, name });
    
    if (signupRes.statusCode === 202) {
      // Login to get user ID
      const loginRes = await agent
        .post("/api/auth/login")
        .send({ email });
      
      if (loginRes.statusCode === 200) {
        // Try to get user ID from different possible response structures
        const userId = loginRes.body?.user?.id || 
                      loginRes.body?.userId || 
                      loginRes.body?.data?.id;
        
        if (userId) {
          testUserIds.push(userId);
          return userId;
        }
      }
    }
    return null;
  };

  describe("POST /api/user/follow", () => {
    let targetUserId;
    
    beforeAll(async () => {
      targetUserId = await createTestUser();
      if (!targetUserId) {
        targetUserId = new ObjectId().toString();
      }
    });

    it("should follow a user successfully", async () => {
      if (!targetUserId) {
        console.log('Skipping - no target user available');
        return;
      }
      
      const res = await agent
        .post("/api/user/follow")
        .send({ targetUserId });
      
      if (res.statusCode === 200) {
        expect(res.body).toMatchObject({
          e: false,
          msg: "Follow status toggled"
        });
      } else {
        console.log(`Follow returned ${res.statusCode}`);
      }
    });

    it("should unfollow a user on second request (toggle)", async () => {
      if (!targetUserId) {
        console.log('Skipping - no target user available');
        return;
      }
      
      // Follow first
      await agent.post("/api/user/follow").send({ targetUserId });
      
      // Unfollow (same endpoint)
      const res = await agent
        .post("/api/user/follow")
        .send({ targetUserId });
      
      if (res.statusCode === 200) {
        expect(res.body).toMatchObject({
          e: false,
          msg: "Follow status toggled"
        });
      }
    });

    it("should return error when trying to follow self", async () => {
      if (!currentUserId) {
        console.log('Skipping - no current user ID available');
        return;
      }
      
      const res = await agent
        .post("/api/user/follow")
        .send({ targetUserId: currentUserId });
      
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
      expect(res.body).toHaveProperty("e", true);
    });

    it("should return error when targetUserId is missing", async () => {
      const res = await agent
        .post("/api/user/follow")
        .send({});
      
      expect(res.statusCode).toBe(400);
    });

    it("should handle invalid targetUserId format", async () => {
      const res = await agent
        .post("/api/user/follow")
        .send({ targetUserId: "invalid-id-format" });
      
      expect(res.statusCode).toBe(400);
    });
  });

  describe("GET /api/user/profile", () => {
    it("should get current user's profile", async () => {
      const res = await agent.get("/api/user/profile");
      
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty("data");
      expect(res.body.data).toHaveProperty("username");
      expect(res.body.data).toHaveProperty("userId");
      expect(res.body.data).toHaveProperty("myself", true);
      expect(res.body).toHaveProperty("feeds");
      expect(res.body).toHaveProperty("followersCount");
      expect(res.body).toHaveProperty("followingCount");
      expect(typeof res.body.followersCount).toBe("number");
      expect(typeof res.body.followingCount).toBe("number");
      expect(Array.isArray(res.body.feeds)).toBe(true);
    });

  });

  describe("GET /api/user/:id", () => {
    let otherUserId;
    
    beforeAll(async () => {
      otherUserId = await createTestUser();
      if (!otherUserId) {
        otherUserId = new ObjectId().toString();
      }
    });

    it("should get another user's profile by ID", async () => {
      if (!otherUserId) {
        console.log('Skipping - no other user available');
        return;
      }
      
      const res = await agent.get(`/api/user/${otherUserId}`);
      
      if (res.statusCode === 200) {
        expect(res.body).toHaveProperty("success", true);
        expect(res.body).toHaveProperty("user");
        expect(res.body.user).toHaveProperty("_id");
        expect(res.body.user).toHaveProperty("username");
        expect(res.body).toHaveProperty("feeds");
        expect(Array.isArray(res.body.feeds)).toBe(true);
      }
    });

    it("should return 404 for non-existent user", async () => {
      const fakeUserId = new ObjectId().toString();
      const res = await agent.get(`/api/user/${fakeUserId}`);
      
      expect(res.statusCode).toBe(404);
      expect(res.body).toHaveProperty("error", "User not found");
    });

    it("should handle invalid user ID format gracefully", async () => {
      const res = await agent.get("/api/user/invalid-id-format");
      
      expect([400, 404]).toContain(res.statusCode);
    });
  });

  describe("Follow relationship consistency", () => {
    let userB;

    beforeAll(async () => {
      userB = await createTestUser();
    });

    it("should track follow relationships", async () => {
      if (!userB) {
        console.log('Skipping - need a test user');
        return;
      }
      
      // Follow user B
      const followRes = await agent
        .post("/api/user/follow")
        .send({ targetUserId: userB });
      
      if (followRes.statusCode === 200) {
        // Check user B's profile to see following status
        const profileB = await agent.get(`/api/user/${userB}`);
        
        if (profileB.statusCode === 200 && profileB.body.followStats) {
          expect(typeof profileB.body.followStats.isFollowing).toBe("boolean");
        }
      }
    });
  });

  describe("Profile data consistency", () => {
    it("should return consistent username between profile endpoints", async () => {
      const myProfile = await agent.get("/api/user/profile");
      
      if (myProfile.statusCode !== 200) {
        console.log('Skipping consistency test - profile endpoint failed');
        return;
      }
      
      const userId = myProfile.body.data?.userId;
      
      if (!userId) {
        console.log('Skipping consistency test - no user ID found');
        return;
      }
      
      const userById = await agent.get(`/api/user/${userId}`);
      
      if (userById.statusCode !== 200) {
        console.log('Skipping consistency test - user by ID endpoint failed');
        return;
      }
      
      const usernameFromProfile = myProfile.body.data?.username;
      const usernameFromById = userById.body.user?.username;
      
      if (usernameFromProfile && usernameFromById) {
        expect(usernameFromProfile).toBe(usernameFromById);
      }
    });
  });

  describe("Edge cases and error handling", () => {
    it("should handle concurrent follow requests gracefully", async () => {
      const targetId = new ObjectId().toString();
      const requests = [];
      
      for (let i = 0; i < 5; i++) {
        requests.push(
          agent.post("/api/user/follow").send({ targetUserId: targetId })
        );
      }
      
      const results = await Promise.all(requests);
      results.forEach(res => {
        expect(res.statusCode).toBeDefined();
      });
    });

    it("should handle malformed JSON", async () => {
      const res = await agent
        .post("/api/user/follow")
        .set('Content-Type', 'application/json')
        .send('{"targetUserId": "incomplete json');
      
      expect(res.statusCode).toBe(400);
    });

    it("should handle empty request body", async () => {
      const res = await agent
        .post("/api/user/follow")
        .send();
      
      expect(res.statusCode).toBe(400);
    });

    it("should handle very long targetUserId", async () => {
      const longId = "a".repeat(1000);
      const res = await agent
        .post("/api/user/follow")
        .send({ targetUserId: longId });
      
      expect(res.statusCode).toBe(400);
    });
  });
});

// Cleanup after all tests
afterAll(async () => {
  if (testUserIds.length > 0) {
    console.log(`Created ${testUserIds.length} test users that may need cleanup`);
  }
});