// ------------------------------------------------------------------
// Bot oficial do Discord: cria uma sala e envia o link no chat.
// ------------------------------------------------------------------
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";
import { config } from "./config.js";
import { genRoomId } from "./rooms.js";

const commands = [
  new SlashCommandBuilder()
    .setName("transmitir")
    .setDescription("Cria uma sala e envia o link para transmitir/assistir a tela"),
].map((c) => c.toJSON());

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(config.botToken);
  if (config.guildId) {
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), {
      body: commands,
    });
    console.log("✅ Comandos registrados no servidor de testes (aparecem na hora).");
  } else {
    await rest.put(Routes.applicationCommands(config.clientId), { body: commands });
    console.log("✅ Comandos globais registrados (podem levar até 1h para aparecer).");
  }
}

export async function startBot() {
  const bot = new Client({ intents: [GatewayIntentBits.Guilds] });

  bot.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "transmitir") return;

    const id = genRoomId();
    const link = `${config.publicUrl}/sala/${id}`;

    await interaction.reply(
      [
        "📺 **Sala de transmissão criada!**",
        "",
        `🔗 ${link}`,
        "",
        "• **Quem vai transmitir:** abra o link e clique em **Compartilhar minha tela**.",
        "• **Quem vai assistir:** é só abrir o mesmo link.",
      ].join("\n"),
    );
  });

  bot.once("ready", async () => {
    console.log(`✅ Bot online: ${bot.user.tag}`);
    const invite =
      `https://discord.com/oauth2/authorize?client_id=${config.clientId}` +
      `&permissions=2048&scope=bot%20applications.commands`;
    console.log("\n🔗 LINK DE CONVITE DO SEU BOT (adicione no seu servidor):");
    console.log(`   ${invite}\n`);
    try {
      await registerCommands();
    } catch (err) {
      console.error("⚠️  Não consegui registrar os comandos:", err?.message ?? err);
    }
  });

  await bot.login(config.botToken);
}
