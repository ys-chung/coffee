import Discord from "discord.js"

import { getDb, setDb } from "../db.js"

export async function deleteChannels(discord: Discord.Client) {
  const channels = getDb("openChannels")

  for (const channelId of channels) {
    const channel = await discord.channels.fetch(channelId)

    if (!channel) continue

    await channel.delete("Match time up")
  }

  await setDb("openChannels", [])
  await setDb("deleteChannelsTime", 0)
}
