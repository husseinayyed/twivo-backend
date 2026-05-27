import { fastify } from '../server.js';
import request from 'supertest';

let agent = null;
let isInitialized = false;

export async function getAgent() {
  if (isInitialized && agent) return agent;
  
  await fastify.ready();
  agent = request.agent(fastify.server);
  
  // Perform authentication once for all tests
  await setupAuthentication(agent);
  
  isInitialized = true;
  return agent;
}

async function setupAuthentication(agent) {
  // Create a test user
  const testUser = {
    name: "Test User",
    email: `test_${Date.now()}@example.com`,
    username: `testuser_${Date.now()}`,
  };
  
  // Sign up
  const signRes = await agent
    .post("/api/auth/sign")
    .send(testUser);
  
  if (signRes.statusCode !== 202) {
    throw new Error(`Signup failed: ${signRes.statusCode} - ${JSON.stringify(signRes.body)}`);
  }
  
  const magicUrl = signRes.body.magicUrl;
  
  // Login to get cookies
  const loginRes = await agent
    .post("/api/auth/login")
    .send({ magicUrl });
  
  if (loginRes.statusCode !== 200) {
    throw new Error(`Login failed: ${loginRes.statusCode} - ${JSON.stringify(loginRes.body)}`);
  }
  
  console.log('✅ Test authentication completed, cookies set');
}

export async function closeServer() {
  if (isInitialized) {
    await fastify.close();
    isInitialized = false;
  }
}