// routes/schemas/authSchemas.js
export const createTwiSchema = {
  body: {
    type: "object",
    required: ["text", "attachment"],
    properties: {
      attachment: { type: "boolean" },
      text: { type: "string" },
    },
  },
};

export const LikeSchema = {
  body: {
    type: 'object',
    required: ['twiId'],
    properties: {
      twiId: {
        type: 'string',
        pattern: '^[0-9a-fA-F]{24}$',
        description: 'MongoDB ObjectId (24 hex characters)'
      }
    }
  }
};