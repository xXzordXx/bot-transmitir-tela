// ------------------------------------------------------------------
// Bot oficial do Discord.
// AUTOMÁTICO: quando alguém entra num canal de voz, o bot cria uma sala
// e posta o link no CHAT da call. Quando a call fica vazia, apaga a msg.
// Também mantém o comando /transmitir como opção manual.
// ------------------------------------------------------------------
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { config } from "./config.js";
import { genRoomId } from "./rooms.js";

// Canais de voz ativos: channelId -> { roomId, messageId }
const active = new Map();

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

function buildRoomMessage(link) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("📺 Transmissão de Tela")
    .setDescription(
      "A call começou! Clique no botão abaixo para **assistir** ou **compartilhar sua tela/câmera** com o pessoal.",
    )
    .setFooter({ text: "A sala é apagada quando a call esvaziar." });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel("Abrir sala de transmissão").setStyle(ButtonStyle.Link).setURL(link),
  );
  return { embeds: [embed], components: [row] };
}

// Conta quantas pessoas (não-bots) estão no canal de voz.
function humanCount(channel) {
  if (!channel || !channel.members) return 0;
  return channel.members.filter((m) => !m.user?.bot).size;
}

async function postRoom(channel) {
  const roomId = genRoomId();
  const link = `${config.publicUrl}/sala/${roomId}`;
  try {
    const msg = await channel.send(buildRoomMessage(link));
    active.set(channel.id, { roomId, messageId: msg.id });
    console.log(`▶️  Sala criada para a call "${channel.name}": ${link}`);
  } catch (err) {
    console.error(`⚠️  Não consegui postar no canal ${channel.id}:`, err?.message ?? err);
  }
}

async function removeRoom(channel) {
  const info = active.get(channel.id);
  if (!info) return;
  active.delete(channel.id);
  try {
    const msg = await channel.messages.fetch(info.messageId).catch(() => null);
    if (msg) await msg.delete().catch(() => {});
    console.log(`⏹️  Call "${channel.name}" esvaziou — mensagem removida.`);
  } catch {
    /* ignora */
  }
}

async function syncChannel(channel) {
  if (!channel) return;
  const count = humanCount(channel);
  if (count > 0 && !active.has(channel.id)) {
    await postRoom(channel);
  } else if (count === 0 && active.has(channel.id)) {
    await removeRoom(channel);
  }
}

export async function startBot() {
  const bot = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  });

  // AUTOMÁTICO: alguém entrou/saiu/trocou de call.
  bot.on("voiceStateUpdate", async (oldState, newState) => {
    const channels = new Set();
    if (oldState.channel) channels.add(oldState.channel);
    if (newState.channel) channels.add(newState.channel);
    for (const ch of channels) await syncChannel(ch);
  });

  // Comando manual (opcional).
  bot.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "transmitir") return;
    const id = genRoomId();
    const link = `${config.publicUrl}/sala/${id}`;
    await interaction.reply({
      content: `📺 **Sala criada!**\n🔗 ${link}\n\nAbra o link para compartilhar a tela ou assistir.`,
    });
  });

  bot.once("ready", async () => {
    console.log(`✅ Bot online: ${bot.user.tag}`);
    const invite =
      `https://discord.com/oauth2/authorize?client_id=${config.clientId}` +
      `&permissions=3072&scope=bot%20applications.commands`;
    console.log("\n🔗 LINK DE CONVITE DO SEU BOT (adicione no seu servidor):");
    console.log(`   ${invite}\n`);

    // Posta em calls que JÁ estão com gente (ex.: após reinício do servidor).
    for (const guild of bot.guilds.cache.values()) {
      try {
        const channels = await guild.channels.fetch();
        for (const ch of channels.values()) {
          if (ch && (ch.isVoiceBased?.() ?? false)) await syncChannel(ch);
        }
      } catch {
        /* ignora */
      }
    }

    try {
      await registerCommands();
    } catch (err) {
      console.error("⚠️  Não consegui registrar os comandos:", err?.message ?? err);
    }
  });

  await bot.login(config.botToken);
}
