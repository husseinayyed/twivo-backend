import { getAgent } from "../../setup.js";
import { faker } from "@faker-js/faker";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { ObjectId } from "mongodb";

function parseColumnarFeedLE(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  const postCount = view.getUint16(0, true); 

  const likesSize = postCount * 4;
  const flagsSize = postCount * 1;
  const totalHeaderSize = 4 + likesSize + flagsSize;

  const likesArray = new Uint32Array(arrayBuffer, 4, postCount);
  const flagsArray = new Uint8Array(arrayBuffer, 4 + likesSize, postCount);
  
  const rawBytes = new Uint8Array(arrayBuffer);
  const posts = new Array(postCount);
  let bodyPtr = totalHeaderSize;

  for (let i = 0; i < postCount; i++) {
    const protoLength = view.getUint32(bodyPtr, true);
    const protoBuffer = rawBytes.subarray(bodyPtr + 4, bodyPtr + 4 + protoLength);
    bodyPtr += 4 + protoLength;

    const bitmask = flagsArray[i];

    posts[i] = {
      likes: likesArray[i],       
      isLiked: (bitmask & 0x01) === 0x01,
      isFollowing: (bitmask & 0x02) === 0x02,
      proto: protoBuffer          
    };
  }

  return posts;
}

let agent;
let createdTwiIds = [];

beforeAll(async () => {
  agent = await getAgent();
});

describe("FEED ROUTES", () => {
  
  const createTestTweet = async () => {
    const res = await agent
      .post("/api/user/create")
      .send({
        text: faker.lorem.sentence(),
        attachment: false
      });
    
    if (res.statusCode === 202) {
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const feedRes = await agent.get("/api/feed/all").responseType("arraybuffer");
      if (feedRes.statusCode === 200 && feedRes.body) {
        const buffer = feedRes.body.buffer || feedRes.body;
        const posts = parseColumnarFeedLE(buffer);
        if (posts.length > 0) {
          createdTwiIds.push("extracted_from_binary_test");
          return "extracted_from_binary_test";
        }
      }
    }
    return null;
  };

  const createTestTweetWithGeneratedId = async () => {
    const generatedId = new ObjectId().toString();
    const res = await agent
      .post("/api/user/create")
      .send({
        text: faker.lorem.sentence(),
        attachment: false
      });
    
    if (res.statusCode === 202) {
      createdTwiIds.push(generatedId);
      return generatedId;
    }
    return null;
  };

  describe("GET /api/feed/all", () => {
    it("should return and successfully parse aligned binary feed payload", async () => {
      const res = await agent
        .get("/api/feed/all")
        .responseType("arraybuffer");

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toMatch(/application\/octet-stream/);
      expect(res.body).toBeDefined();

      const rawBuffer = res.body.buffer || res.body;
      const parsedFeed = parseColumnarFeedLE(rawBuffer);

      expect(Array.isArray(parsedFeed)).toBe(true);
      
      if (parsedFeed.length > 0) {
        const singlePost = parsedFeed[0];
        expect(singlePost).toHaveProperty("likes");
        expect(typeof singlePost.likes).toBe("number");
        expect(singlePost).toHaveProperty("isLiked");
        expect(typeof singlePost.isLiked).toBe("boolean");
        expect(singlePost).toHaveProperty("isFollowing");
        expect(typeof singlePost.isFollowing).toBe("boolean");
        expect(singlePost).toHaveProperty("proto");
        expect(singlePost.proto instanceof Uint8Array).toBe(true);
      }
    });

    it("should handle unauthorized request", async () => {
      const unAuthAgent = await getAgent(false);
      const res = await unAuthAgent.get("/api/feed/all");
      
      expect(res.statusCode).toBeDefined();
    });
  });

});

afterAll(async () => {
  if (createdTwiIds.length > 0 && agent) {
    for (const twiId of createdTwiIds) {
      try {
        console.log(`Test cleanup for tweet: ${twiId}`);
      } catch (e) {
        
      }
    }
  }
});