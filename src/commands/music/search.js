const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ApplicationCommandOptionType,
  ComponentType,
} = require("discord.js");
const prettyMs = require("pretty-ms");
const { EMBED_COLORS, MUSIC } = require("@root/config");

const search_prefix = {
  YT: "ytsearch",
  YTM: "ytmsearch",
  SC: "scsearch",
};

/**
 * @type {import("@structures/Command")}
 */
module.exports = {
  name: "search",
  description: "Youtubetaki şarkılar için arama yaparsın",
  category: "MUSIC",
  botPermissions: ["EmbedLinks"],
  command: {
    enabled: true,
    usage: "<şarkı-adı>",
    minArgsCount: 1,
  },
  slashCommand: {
    enabled: true,
    options: [
      {
        name: "yaz",
        description: "Aranacak şarkı",
        type: ApplicationCommandOptionType.String,
        required: true,
      },
    ],
  },

  async messageRun(message, args) {
    const query = args.join(" ");
    const response = await search(message, query);
    if (response) await message.safeReply(response);
  },

  async interactionRun(interaction) {
    const query = interaction.options.getString("yaz");
    const response = await search(interaction, query);
    if (response) await interaction.followUp(response);
    else interaction.deleteReply();
  },
};

/**
 * @param {import("discord.js").CommandInteraction|import("discord.js").Message} arg0
 * @param {string} query
 */
async function search({ member, guild, channel }, query) {
  if (!member.voice.channel) return "🚫 İlk önce ses kanalına katılmalısın.";

  let player = guild.client.musicManager.getPlayer(guild.id);
  if (player && !guild.members.me.voice.channel) {
    player.disconnect();
    await guild.client.musicManager.destroyPlayer(guild.id);
  }
  if (player && member.voice.channel !== guild.members.me.voice.channel) {
    return "🚫 Benimle aynı ses kanalında olmalısın.";
  }

  let res;
  try {
    res = await guild.client.musicManager.rest.loadTracks(
      /^https?:\/\//.test(query) ? query : `${search_prefix[MUSIC.DEFAULT_SOURCE]}:${query}`
    );
  } catch (err) {
    return "🚫 Ararken bir hatayla karşılaştım tekrar dene.";
  }

  let embed = new EmbedBuilder().setColor(EMBED_COLORS.BOT_EMBED);
  let tracks;

  switch (res.loadType) {
    case "LOAD_FAILED":
      guild.client.logger.error("Search Exception", res.exception);
      return "🚫 Ararken bir hatayla karşılaştım tekrar dene.";

    case "NO_MATCHES":
      return `Sonuç bulunamadı! ${query}`;

    case "TRACK_LOADED": {
      const [track] = res.tracks;
      tracks = [track];
      if (!player?.playing && !player?.paused && !player?.queue.tracks.length) {
        embed.setAuthor({ name: "Şarkı sıraya eklendi" });
        break;
      }

      const fields = [];
      embed
        .setAuthor({ name: "Şarkı sıraya eklendi" })
        .setDescription(`[${track.info.title}](${track.info.uri})`)
        .setFooter({ text: `İsteyen: ${member.user.tag}` });

      fields.push({
        name: "Şarkı uzunluğu",
        value: "`" + prettyMs(track.info.length, { colonNotation: true }) + "`",
        inline: true,
      });

      // if (typeof track.displayThumbnail === "function") embed.setThumbnail(track.displayThumbnail("hqdefault"));
      if (player?.queue?.tracks?.length > 0) {
        fields.push({
          name: "Sıradaki yeri",
          value: (player.queue.tracks.length + 1).toString(),
          inline: true,
        });
      }
      embed.addFields(fields);
      break;
    }

    case "PLAYLIST_LOADED":
      tracks = res.tracks;
      embed
        .setAuthor({ name: "Oynatma listesi sıraya eklendi." })
        .setDescription(res.playlistInfo.name)
        .addFields(
          {
            name: "Sıradaki",
            value: `${res.tracks.length} şarkı(lar)`,
            inline: true,
          },
          {
            name: "Oynatma listesi uzunluğu",
            value:
              "`" +
              prettyMs(
                res.tracks.map((t) => t.info.length).reduce((a, b) => a + b, 0),
                { colonNotation: true }
              ) +
              "`",
            inline: true,
          }
        )
        .setFooter({ text: `İsteyen: ${member.user.tag}` });
      break;

    case "SEARCH_RESULT": {
      let max = guild.client.config.MUSIC.MAX_SEARCH_RESULTS;
      if (res.tracks.length < max) max = res.tracks.length;

      const results = res.tracks.slice(0, max);
      const options = results.map((result, index) => ({
        label: result.info.title,
        value: index.toString(),
      }));

      const menuRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("search-results")
          .setPlaceholder("Eklenecek şarkıları seç.")
          .setMaxValues(max)
          .addOptions(options)
      );

      const tempEmbed = new EmbedBuilder()
        .setColor(EMBED_COLORS.BOT_EMBED)
        .setAuthor({ name: "Arama sonuçları" })
        .setDescription(`Sıraya hangilerinin eklenmesini istiyorsun?`);

      const sentMsg = await channel.send({
        embeds: [tempEmbed],
        components: [menuRow],
      });

      try {
        const response = await channel.awaitMessageComponent({
          filter: (reactor) => reactor.message.id === sentMsg.id && reactor.user.id === member.id,
          idle: 30 * 1000,
          componentType: ComponentType.StringSelect,
        });

        await sentMsg.delete();
        if (!response) return "🚫 Şarkıları seçmen çok uzun sürdü";

        if (response.customId !== "search-results") return;
        const toAdd = [];
        response.values.forEach((v) => toAdd.push(results[v]));

        // Only 1 song is selected
        if (toAdd.length === 1) {
          tracks = [toAdd[0]];
          embed.setAuthor({ name: "Şarkılar sıraya eklendi." });
        } else {
          tracks = toAdd;
          embed
            .setDescription(`🎶 ${toAdd.length} adet şarkı sıraya eklendi.`)
            .setFooter({ text: `İsteyen: ${member.user.tag}` });
        }
      } catch (err) {
        console.log(err);
        await sentMsg.delete();
        return "🚫 Yanıt alınamadı tekrar dene!";
      }
    }
  }

  // create a player and/or join the member's vc
  if (!player?.connected) {
    player = guild.client.musicManager.createPlayer(guild.id);
    player.queue.data.channel = channel;
    player.connect(member.voice.channel.id, { deafened: true });
  }

  // do queue things
  const started = player.playing || player.paused;
  player.queue.add(tracks, { requester: member.user.tag, next: false });
  if (!started) {
    await player.queue.start();
  }

  return { embeds: [embed] };
}
