import library from './builtin-prompts.json'

type BuiltInPrompt = Readonly<{
  id: string
  title: string
  content: string
}>

const profiles = library.profiles as { id: string, name: string, content: string }[]

export const BUILTIN_ENHANCED_PROMPTS: readonly BuiltInPrompt[] = Object.freeze(
  profiles.map((profile) => Object.freeze({
    id: `builtin-${profile.id}`,
    title: profile.name,
    content: profile.content,
  })),
)
