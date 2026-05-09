import { getAgent } from "../../setup.js";
import { faker } from "@faker-js/faker";
import { describe, expect, it, beforeAll } from "vitest";

let agent;

beforeAll(async () => {
  agent = await getAgent();
});

describe("TWI CREATION", () => {
  it("POST /api/user/create - should create TWI without media", async () => {
    const res = await agent
      .post("/api/user/create")
      .send({
        text: faker.lorem.sentence(),
        attachment: false
      });
    
    expect(res.statusCode).toBe(202);
  });

  it("POST /api/user/create - should create TWI with media token", async () => {
    const res = await agent
      .post("/api/user/create")
      .send({
        text: faker.lorem.sentence(),
        attachment: true
      });
    
    expect(res.statusCode).toBe(202);
    expect(res.body).toHaveProperty("token");
  });

  it("POST /api/user/create - should handle empty text", async () => {
    const res = await agent
      .post("/api/user/create")
      .send({
        text: "",
        attachment: false
      });

    expect(res.statusCode).toBe(400);
  });

  it("POST /api/user/create - should handle long text", async () => {
    const longText = faker.lorem.paragraphs(5);
    const res = await agent
      .post("/api/user/create")
      .send({
        text: longText,
        attachment: false
      });

    expect(res.statusCode).toBe(400);
  });

  it("POST /api/user/create - should handle special characters", async () => {
    const specialText = "🚀 Special chars: @#$%^&*() 🌟 Unicode: 你好";
    const res = await agent
      .post("/api/user/create")
      .send({
        text: specialText,
        attachment: false
      });

    expect(res.statusCode).toBe(202);
  });
});
