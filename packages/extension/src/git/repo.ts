export function normalizeRepoUrl(remoteUrl: string): string | null {
  const patterns = [/github\.com[:/](.+?\/.+?)(?:\.git)?$/];
  for (const pattern of patterns) {
    const match = remoteUrl.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return null;
}
