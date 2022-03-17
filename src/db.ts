import { Low, JSONFile } from "lowdb"

type State = {
  messageId: string
  closeTime: number
}

const adapter = new JSONFile<State>("./data/db.json")

const db = new Low<State>(adapter)
await db.read()

db.data ||= {
  messageId: "",
  closeTime: 0
}

await db.write()

export default db
