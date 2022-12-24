const { musicValidations } = require("@helpers/BotUtils");
const { LoopType } = require("@lavaclient/queue");
const { ApplicationCommandOptionType } = require("discord.js");

/**
 * @type {import("@structures/Command")}
 */
module.exports = {
  name: "loop",
  description: "Şarkı döngüsü",
  category: "MUSIC",
  validations: musicValidations,
  command: {
    enabled: true,
    minArgsCount: 1,
    usage: "<liste|sarki>",
  },
  slashCommand: {
    enabled: true,
    options: [
      {
        name: "secim",
        type: ApplicationCommandOptionType.String,
        description: "Ne döngüye alınsın Şarkı/Oynatma listesi",
        required: false,
        choices: [
          {
            name: "liste",
            value: "Oynatma listesini döngüye al",
          },
          {
            name: "sarki",
            value: "Şarkıyı döngüye al",
          },
        ],
      },
    ],
  },

  async messageRun(message, args) {
    const input = args[0].toLowerCase();
    const type = input === "liste" ? "liste" : "sarki";
    const response = toggleLoop(message, type);
    await message.safeReply(response);
  },

  async interactionRun(interaction) {
    const type = interaction.options.getString("secim") || "sarki";
    const response = toggleLoop(interaction, type);
    await interaction.followUp(response);
  },
};

/**
 * @param {import("discord.js").CommandInteraction|import("discord.js").Message} arg0
 * @param {"liste"|"sarki"} type
 */
function toggleLoop({ client, guildId }, type) {
  const player = client.musicManager.getPlayer(guildId);

  // sarki
  if (type === "sarki") {
    player.queue.setLoop(LoopType.Song);
    return "Şarkı döngüye alındı";
  }

  // liste
  else if (type === "liste") {
    player.queue.setLoop(1);
    return "Oynatma listesi döngüye alındı";
  }
}
