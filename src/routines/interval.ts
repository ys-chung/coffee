import Discord from "discord.js"
import dayjs from "dayjs"

import { getDb } from "../db.js"
import { remindChannels } from "./remind.js"
import { deleteChannels } from "./delete.js"
import { pairRoutine } from "./pair.js"
import { autoAsk } from "./ask.js"

export async function checkIfTime(
  channel: Discord.GuildTextBasedChannel,
  everyoneRoleId: string,
  categoryId: string
) {
  console.log("Checking if time is up...")

  const closeTime = getDb("closeTime")
  const deleteChannelsTime = getDb("deleteChannelsTime")
  const remindChannelsTime = getDb("remindChannelsTime")
  const askTime = getDb("askTime")

  const nowTime = dayjs().unix()

  // If remind time
  if (remindChannelsTime !== 0 && nowTime > remindChannelsTime) {
    console.log("Channels remind time!")

    try {
      await remindChannels(channel.client)
    } catch (error) {
      console.error("Failed to remind channels (timer). ", error)
    }
  }

  // If delete time
  if (deleteChannelsTime !== 0 && nowTime > deleteChannelsTime) {
    console.log("Channels delete time!")

    try {
      await deleteChannels(channel.client)
    } catch (error) {
      console.error("Failed to delete channels (timer). ", error)
    }
  }

  // If close time is up
  if (closeTime !== 0 && nowTime > closeTime) {
    console.log("Time's up! Sending results.")

    try {
      await pairRoutine(channel, everyoneRoleId, categoryId)
    } catch (error) {
      console.error("Failed to send results (timer). ", error)
    }
  }

  // If it is ask time
  if (askTime !== 0 && nowTime > askTime) {
    console.log("Ask time!")

    try {
      await autoAsk(channel)
    } catch(error) {
      console.error("Failed to ask", error)
    }
  }
}
