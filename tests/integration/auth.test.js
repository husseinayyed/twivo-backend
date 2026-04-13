import request from "supertest";
import { faker } from "@faker-js/faker";
import { fastify } from "../../server.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let magicUrl;
let cookies;
beforeAll(async () => {
  await fastify.ready();
});

afterAll(async () => {
  await fastify.close();
});

describe("AUTH FLOW (REAL HTTP)", () => {
  it("GET /api/ping", async () => {
    const res = await request(fastify.server).get("/api/ping");
    expect(res.statusCode).toBe(202);
  });

  it("POST /api/auth/sign", async () => {
    const res = await request(fastify.server)
      .post("/api/auth/sign")
      .send({
        name: faker.person.fullName(),
        email: faker.internet.email(),
        username: faker.internet.username().toLowerCase(),
      });

    expect(res.statusCode).toBe(202);

    magicUrl = res.body.magicUrl;
    expect(magicUrl).toBeDefined();
  });

  it("POST /api/auth/login", async () => {
    const res = await request(fastify.server)
      .post("/api/auth/login")
      .send({ magicUrl:magicUrl });

    expect(res.statusCode).toBe(200);

    cookies = res.headers["set-cookie"];
    expect(cookies).toBeDefined();
  });

  it("GET /api/me", async () => {
    const res = await request(fastify.server)
      .get("/api/me")
      .set("Cookie", cookies);

    expect(res.statusCode).toBe(200);
  });
});