const knowledge = [
    "这是一条默认知识库"
];

module.exports = (query, maxResults = 10) => {
    const keywords = query.trim().toLowerCase().split(/\s+/);
    if (keywords[0] === "all" && keywords.length === 1) return knowledge;
    if (keywords.length === 1 && keywords[0] === "") return ["请输入有效的搜索关键词"];

    // 使用 Set 去重 + 过滤 + 排序
    const results = knowledge
        .filter(doc => keywords.some(kw => doc.toLowerCase().includes(kw)))
        .sort((a, b) => {
            // 按匹配关键词数量排序（包含更多关键词的排前面）
            const aScore = keywords.filter(kw => a.toLowerCase().includes(kw)).length;
            const bScore = keywords.filter(kw => b.toLowerCase().includes(kw)).length;
            return bScore - aScore;
        });

    if (results.length === 0) return [];
    return maxResults === -1 ? results : results.slice(0, maxResults);
}
