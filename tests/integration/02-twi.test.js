// tests/integration/02-twi.test.js
import { getAgent } from "../setup.js";
import { faker } from "@faker-js/faker";
import { describe, expect, it, beforeAll } from "vitest";

let agent;

beforeAll(async () => {
  agent = await getAgent(); // Reuses authenticated agent from setup
});

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