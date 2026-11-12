const { z } = require('zod');

const createMatchSchema = z.object({
  name: z.string().min(3).max(100),
  description: z.string().max(500).optional().default(''),
  entryCoins: z.number().int().min(0),
  winnerReward: z.number().int().min(0),
  rules: z
    .object({
      requireSixToStart: z.boolean().optional().default(true),
      bonusTurnOnSix: z.boolean().optional().default(true),
      bonusTurnOnCapture: z.boolean().optional().default(false),
      maxConsecutiveSixes: z.number().int().min(1).max(5).optional().default(3),
      turnTimeoutSeconds: z.number().int().min(10).max(120).optional().default(30),
    })
    .optional()
    .default({}),
});

const updateMatchSchema = createMatchSchema.partial();

module.exports = { createMatchSchema, updateMatchSchema };
