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
