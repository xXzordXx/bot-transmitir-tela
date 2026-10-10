import { config } from "./config.js";
import { startServer } from "./server.js";
import { startBot } from "./bot.js";

function validateConfig() {
  const faltando = [];
  if (!config.botToken) faltando.push("BOT_TOKEN");
  if (!config.clientId) faltando.push("CLIENT_ID");
  if (faltando.length) {
    console.error(
      `❌ Faltam variáveis no .env: ${faltando.join(", ")}\n` +
        '   Copie ".env.example" para ".env" e preencha.',
    );
    process.exit(1);
  }
}

(async () => {
  validateConfig();
  startServer();
  try {
    await startBot();
  } catch (err) {
    console.error("❌ Falha no login do bot (verifique BOT_TOKEN):", err?.message ?? err);
    process.exit(1);
  }
})();
