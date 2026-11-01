export interface WordDiff { word: string; kind: "same" | "added" | "removed"; }

export function wordDiff(before: string, after: string): WordDiff[] {
  const left = before.split(/(\s+)/);
  const right = after.split(/(\s+)/);
  const output: WordDiff[] = [];
  const limit = Math.max(left.length, right.length);
  for (let i = 0; i < limit; i += 1) {
    if (left[i] === right[i]) output.push({ word: right[i] ?? "", kind: "same" });
    else {
      if (left[i]) output.push({ word: left[i], kind: "removed" });
      if (right[i]) output.push({ word: right[i], kind: "added" });
    }
  }
  return output;
}
