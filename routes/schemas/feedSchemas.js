// routes/schemas/authSchemas.js
export const createTwiSchema = {
  body: {
    type: "object",
    required: ["text", "attachment"],
    properties: {
      attachment: { type: "boolean" },
      text: { 
        type: "string",
        minLength:3,
        maxLength:240
      },
    },
  },
};
export const LikeSchema = {
  body: {
    type: 'object',
    required: ['twiId'],
    additionalProperties: false, // 🔒 Crucial Security Addition: Drops unmapped rogue payload attributes
    properties: {
      twiId: {
        type: 'string',
        pattern: '^[0-9a-fA-F]{24}$', // Enforces exact 24 hex characters natively
        description: 'MongoDB ObjectId string representation'
      }
    }
  }
};