import Discord from "discord.js"

export async function prompt(
  interaction: Discord.CommandInteraction,
  content: string,
  buttonCommandName: string
) {
  await interaction.reply({
    content,
    ephemeral: true,
    components: [
      {
        type: "ACTION_ROW",
        components: [
          {
            type: "BUTTON",
            label: "Yes, I am sure",
            style: "DANGER",
            customId: buttonCommandName
          }
        ]
      }
    ]
  })
}

export async function fetchChannel(
  client: Discord.Client,
  id: Discord.Snowflake
) {
  const channel = await client.channels.fetch(id)

  if (!channel || !channel.isText())
    throw new Error("Fetched channel is not a text channel!")

  return channel as Discord.GuildTextBasedChannel
}
