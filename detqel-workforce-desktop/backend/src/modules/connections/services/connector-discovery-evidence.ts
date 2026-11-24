/** Select source excerpts without another model call, retaining source offsets and configuration context. */
export function discoveryExcerpt(source: string): string {
    const budget = 12_000;
    if (source.length <= budget) return source;
    const chunks: Array<{ start: number; end: number; score: number }> = [];
    for (let start = 0; start < source.length; start += 2800) {
        const end = Math.min(start + 3200, source.length);
        const text = source.slice(start, end);
        const score = (/https?:\/\/[^\s"<>]*(?:\/mcp\b|\/api\b|\/repos\/)|mongodb(?:\+srv)?:\/\/|postgres(?:ql)?:\/\//i.test(text) ? 20 : 0)
            + (/authorization|bearer|oauth|api.?key|connection.?string/i.test(text) ? 8 : 0)
            + (/```|"(?:env|args|headers)"|environment.?variables/i.test(text) ? 6 : 0)
            + (/endpoint|transport|configuration|required|scopes?|credentials?|username|password|fine.grained|selected repositor|contents.*read/i.test(text) ? 4 : 0);
        chunks.push({ start, end, score });
    }
    const selected = [{ start: 0, end: 700, score: 0 }];
    for (const chunk of chunks.sort((left, right) => right.score - left.score || left.start - right.start)) {
        if (selected.some(item => item.start <= chunk.start && item.end >= chunk.end)) continue;
        if (selected.reduce((total, item) => total + item.end - item.start, 0) + chunk.end - chunk.start > budget - 300) continue;
        selected.push(chunk);
        if (selected.length === 4) break;
    }
    const ranges: Array<{ start: number; end: number }> = [];
    for (const chunk of selected.sort((left, right) => left.start - right.start)) {
        const last = ranges.at(-1);
        if (last && chunk.start <= last.end) last.end = Math.max(last.end, chunk.end);
        else ranges.push({ start: chunk.start, end: chunk.end });
    }
    return ranges.map(range => `[Source excerpt, characters ${range.start}-${range.end}]\n${source.slice(range.start, range.end)}`).join("\n\n");
}
