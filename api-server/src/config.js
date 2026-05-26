export const config = {
  DISCORD_SERVER_URL: process.env.DISCORD_SERVER_URL || "https://discord.gg/your-invite-here",
  MONGODB_URL: process.env.DATABASE_URL || "postgresql://localhost:5432/codez",
  OWNER_PASSWORD: process.env.OWNER_PASSWORD || "owner123",
};
