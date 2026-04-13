// tests/integration/01-auth.test.js
import { getAgent, closeServer } from "../setup.js";
import { faker } from "@faker-js/faker";
import { beforeAll, afterAll, describe, expect, it } from "vitest";

let agent;

beforeAll(async () => {
  agent = await getAgent(); // Already authenticated!
});

afterAll(async () => {
  await closeServer();
});

describe("AUTH FLOW (REAL HTTP)", () => {
  it("GET /api/ping", async () => {
    const res = await agent.get("/api/ping");
    expect(res.statusCode).toBe(200);
  });

});