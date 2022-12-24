const { EmbedBuilder, ApplicationCommandOptionType } = require("discord.js");
const prettyMs = require("pretty-ms");
const { EMBED_COLORS, MUSIC } = require("@root/config");
const { SpotifyItemType } = require("@lavaclient/spotify");
const search_prefix = {
  YT: "ytsearch",
  YTM: "ytmsearch",
  SC: "scsearch",
};
/**
 * @type {import("@structures/Command")}
 */
module.exports = {
  name: "play",
  description: "Şarkı çalar",
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
        description: "şarkı adı ya da url",
        type: ApplicationCommandOptionType.String,
        required: true,
      },
    ],
  },
  async messageRun(message, args) {
    const query = args.join(" ");
    const response = await play(message, query);
    await message.safeReply(response);
  },
  async interactionRun(interaction) {
    const query = interaction.options.getString("yaz");
    const response = await play(interaction, query);
    await interaction.followUp(response);
  },
};
/**
 * @param {import("discord.js").CommandInteraction|import("discord.js").Message} arg0
 * @param {string} query
 */
async function play({ member, guild, channel }, query) {
  if (!member.voice.channel) return "🚫 İlk önce bir ses kanalına katıl.";
  let player = guild.client.musicManager.getPlayer(guild.id);
  if (player && !guild.members.me.voice.channel) {
    player.disconnect();
    await guild.client.musicManager.destroyPlayer(guild.id);
  }
  if (player && member.voice.channel !== guild.members.me.voice.channel) {
    return "🚫 Benimle aynı ses kanalında olmalısın.";
  }
  let embed = new EmbedBuilder().setColor(EMBED_COLORS.BOT_EMBED);
  let tracks;
  let description = "";
  try {
    if (guild.client.musicManager.spotify.isSpotifyUrl(query)) {
      if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
        return "🚫 Spotify bağlantıları şimdilik çalışmıyor.";
      }
      const item = await guild.client.musicManager.spotify.load(query);
      switch (item?.type) {
        case SpotifyItemType.Track: {
          const track = await item.resolveYoutubeTrack();
          tracks = [track];
          description = `[${track.info.title}](${track.info.uri})`;
          break;
        }
        case SpotifyItemType.Artist:
          tracks = await item.resolveYoutubeTracks();
          description = `Artist: [**${item.name}**](${query})`;
          break;
        case SpotifyItemType.Album:
          tracks = await item.resolveYoutubeTracks();
          description = `Albüm: [**${item.name}**](${query})`;
          break;
        case SpotifyItemType.Playlist:
          tracks = await item.resolveYoutubeTracks();
          description = `Çalma listesi: [**${item.name}**](${query})`;
          break;
        default:
          return "🚫 Şarkıyı ararken bir hata ile karşılaştım.";
      }

      if (!tracks) guild.client.logger.debug({ query, item });
    } else {
      const res = await guild.client.musicManager.rest.loadTracks(
        /^https?:\/\//.test(query) ? query : `${search_prefix[MUSIC.DEFAULT_SOURCE]}:${query}`
      );
      switch (res.loadType) {
        case "LOAD_FAILED":
          guild.client.logger.error("Search Exception", res.exception);
          return "🚫 Şarkıyı ararken bir hata ile karşılaştım.";
        case "NO_MATCHES":
          return `${query} hakkında sonuç bulunamadı.`;
        case "PLAYLIST_LOADED":
          tracks = res.tracks;
          description = res.playlistInfo.name;
          break;
        case "TRACK_LOADED":
        case "SEARCH_RESULT": {
          const [track] = res.tracks;
          tracks = [track];
          break;
        }

        default:
          guild.client.logger.debug("Unknown loadType", res.loadType);
          guild.client.logger.debug("Unknown loadType", res);
          return "🚫 Şarkıyı ararken bir hata ile karşılaştım.";
      }

      if (!tracks) guild.client.logger.debug({ query, res });
    }
  } catch (error) {
    guild.client.logger.error("Search Exception", error);
    return "🚫 Şarkıyı ararken bir hata ile karşılaştım.";
  }

  if (!tracks) return "🚫 Şarkıyı ararken bir hata ile karşılaştım.";

  if (tracks.length === 1) {
    const track = tracks[0];
    if (!player?.playing && !player?.paused && !player?.queue.tracks.length) {
      embed.setAuthor({ name: "Sıraya eklendi" });
    } else {
      const fields = [];
      embed
        .setAuthor({ name: "Sıraya eklendi" })
        .setDescription(`[${track.info.title}](${track.info.uri})`)
        .setFooter({ text: `İsteyen: ${member.user.tag}` });
      fields.push({
        name: "Şarkı uzunluğu",
        value: "`" + prettyMs(track.info.length, { colonNotation: true }) + "`",
        inline: true,
      });
      if (player?.queue?.tracks?.length > 0) {
        fields.push({
          name: "Sıradaki konumu",
          value: (player.queue.tracks.length + 1).toString(),
          inline: true,
        });
      }
      embed.addFields(fields);
    }
  } else {
    embed
      .setAuthor({ name: "Oynatma Listesi sıraya eklendi" })
      .setDescription(description)
      .addFields(
        {
          name: "Sıradaki",
          value: `${tracks.length} şarkı(lar)`,
          inline: true,
        },
        {
          name: "Çalma listesi uzunluğu",
          value:
            "`" +
            prettyMs(
              tracks.map((t) => t.info.length).reduce((a, b) => a + b, 0),
              { colonNotation: true }
            ) +
            "`",
          inline: true,
        }
      )
      .setFooter({ text: `İsteyen: ${member.user.tag}` });
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