import Discord from "discord.js"
import _ from "lodash"

import { getDb } from "../db.js"

export async function nudgeChannels(discord: Discord.Client) {
  const channels = getDb("openChannels")

  for (const channelId of channels) {
    const channel = await discord.channels.fetch(channelId)

    if (!channel || !channel.isText()) continue

    const messages = await channel.messages.fetch({ limit: 1 })
    const firstMessage = messages.at(0)

    if (!firstMessage) return

    if (firstMessage.author.id === discord.user?.id) {
      // await channel.send("bad!")
      console.log(`no message yet in ${channel.id}`)
    }
  }
}
