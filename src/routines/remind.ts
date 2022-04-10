import Discord from "discord.js"

import { getDb, setDb } from "../db.js"

export async function remindChannels(discord: Discord.Client) {
  const channels = getDb("openChannels")
  const deleteChannelsTime = getDb("deleteChannelsTime")

  for (const channelId of channels) {
    const channel = await discord.channels.fetch(channelId)

    if (!channel || !channel.isText()) continue

    await channel.send(
      `**⚠️ Reminder: This channel will be deleted at <t:${deleteChannelsTime}:F>!**
If you wish to continue talking afterwards, feel free to do so in other channels of the server, or in direct messages!`
    )
  }

  await setDb("remindChannelsTime", 0)
}
