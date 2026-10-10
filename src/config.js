import "dotenv/config";

const port = Number(process.env.PORT ?? 3000);

export const config = {
  botToken: process.env.BOT_TOKEN ?? "",
  clientId: process.env.CLIENT_ID ?? "",
  guildId: process.env.GUILD_ID ?? "",
  port,
  publicUrl: (process.env.PUBLIC_URL ?? `http://localhost:${port}`).replace(/\/+$/, ""),
};
