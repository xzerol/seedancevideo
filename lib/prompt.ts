export function parseAssetMentions(prompt: string) {
  const names = new Set<string>();
  const mentionPattern = /@([^\s@，。！？、,.!?]+)/gu;
  let match: RegExpExecArray | null;

  while ((match = mentionPattern.exec(prompt))) {
    const name = match[1]
      ?.split(/中的|里的|中|里|和|与|及/)
      .at(0)
      ?.trim();
    if (name) names.add(name);
  }

  return [...names];
}
