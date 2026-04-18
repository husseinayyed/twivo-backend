// tests/integration/01-auth.test.js
import { getAgent, closeServer } from "../setup.js";
import { faker } from "@faker-js/faker";
import { beforeAll, afterAll, describe, expect, it } from "vitest";

let agent;

beforeAll(async () => {
  agent = await getAgent();
});

afterAll(async () => {
  await closeServer();
});

describe("AUTH FLOW (REAL HTTP)", () => {
  it("GET /api/ping", async () => {
    const res = await agent.get("/api/ping");
    expect(res.statusCode).toBe(200);
  });

  describe("User Authentication - Signup Tests", () => {
    it("should sign up a new user successfully", async () => {
      const testUser = {
        name: faker.person.fullName(),
        email: faker.internet.email(),
        username: faker.internet.username(),
      };
      
      const signRes = await agent.post("/api/auth/sign").send(testUser);
      expect(signRes.statusCode).toBe(202);
      expect(signRes.body).toHaveProperty("magicUrl");
    });

    it("should fail signup with duplicate email (pending signup)", async () => {
      const email = faker.internet.email();
      
      const firstUser = {
        name: faker.person.fullName(),
        email: email,
        username: faker.internet.username(),
      };
      
      await agent.post("/api/auth/sign").send(firstUser);
      
      const secondUser = {
        name: faker.person.fullName(),
        email: email,
        username: faker.internet.username(),
      };
      
      const signRes = await agent.post("/api/auth/sign").send(secondUser);
      expect(signRes.statusCode).toBe(409);
    });

    it("should fail signup with duplicate username (pending signup)", async () => {
      const username = faker.internet.username();
      
      const firstUser = {
        name: faker.person.fullName(),
        email: faker.internet.email(),
        username: username,
      };
      
      await agent.post("/api/auth/sign").send(firstUser);
      
      const secondUser = {
        name: faker.person.fullName(),
        email: faker.internet.email(),
        username: username,
      };
      
      const signRes = await agent.post("/api/auth/sign").send(secondUser);
      expect(signRes.statusCode).toBe(409);
    });

    it("should fail signup with missing email", async () => {
      const invalidUser = {
        name: faker.person.fullName(),
        username: faker.internet.username(),
      };
      
      const signRes = await agent.post("/api/auth/sign").send(invalidUser);
      expect(signRes.statusCode).toBe(400);
    });

    it("should fail signup with missing username", async () => {
      const invalidUser = {
        name: faker.person.fullName(),
        email: faker.internet.email(),
      };
      
      const signRes = await agent.post("/api/auth/sign").send(invalidUser);
      expect(signRes.statusCode).toBe(400);
    });

    it("should fail signup with missing name", async () => {
      const invalidUser = {
        email: faker.internet.email(),
        username: faker.internet.username(),
      };
      
      const signRes = await agent.post("/api/auth/sign").send(invalidUser);
      expect(signRes.statusCode).toBe(400);
    });
  });

  describe("User Authentication - Login Tests", () => {
    it("should login with valid magic URL", async () => {
      const testUser = {
        name: faker.person.fullName(),
        email: faker.internet.email(),
        username: faker.internet.username(),
      };
      
      const signRes = await agent.post("/api/auth/sign").send(testUser);
      const loginRes = await agent.post("/api/auth/login").send({ 
        magicUrl: signRes.body.magicUrl 
      });
      
      expect(loginRes.statusCode).toBe(200);
      expect(loginRes.headers["set-cookie"]).toBeDefined();
    });

    it("should fail login with invalid magic URL", async () => {
      const loginRes = await agent.post("/api/auth/login").send({ 
        magicUrl: "invalid-magic-url-123" 
      });
      expect(loginRes.statusCode).toBe(400);
    });

    it("should login and set authentication cookies", async () => {
      const testUser = {
        name: faker.person.fullName(),
        email: faker.internet.email(),
        username: faker.internet.username(),
      };
      
      const signRes = await agent.post("/api/auth/sign").send(testUser);
      const loginRes = await agent.post("/api/auth/login").send({ 
        magicUrl: signRes.body.magicUrl 
      });
      
      expect(loginRes.statusCode).toBe(200);
      
      const cookies = loginRes.headers["set-cookie"];
      expect(cookies).toBeDefined();
      
      const cookieStrings = Array.isArray(cookies) ? cookies : [cookies];
      const hasAccessToken = cookieStrings.some(c => c.includes("accessToken"));
      const hasRefreshToken = cookieStrings.some(c => c.includes("refreshToken"));
      
      expect(hasAccessToken).toBe(true);
      expect(hasRefreshToken).toBe(true);
    });
  });

  describe("User Authentication - Edge Cases", () => {
    it("should handle concurrent signup requests with same email", async () => {
      const email = faker.internet.email();
      const baseUsername = faker.internet.username();
      
      const requests = [
        agent.post("/api/auth/sign").send({
          name: faker.person.fullName(),
          email: email,
          username: `${baseUsername}_1`,
        }),
        agent.post("/api/auth/sign").send({
          name: faker.person.fullName(),
          email: email,
          username: `${baseUsername}_2`,
        }),
        agent.post("/api/auth/sign").send({
          name: faker.person.fullName(),
          email: email,
          username: `${baseUsername}_3`,
        }),
      ];
      
      const responses = await Promise.all(requests);
      const successCount = responses.filter(r => r.statusCode === 202).length;
      const conflictCount = responses.filter(r => r.statusCode === 409).length;
      
      expect(successCount).toBe(1);
      expect(conflictCount).toBe(2);
    });
  });
});