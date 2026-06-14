const config = require('./Config/config.js');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const memoryMap = new Map(); // 记忆缓存
const tools = config.ai.tools; // 工具定义

const memoryDir = path.join(__dirname, 'memory');
const memoryBakDir = path.join(__dirname, 'memory_bak');
if (!fs.existsSync(memoryDir)) fs.mkdirSync(memoryDir, { recursive: true });
if (!fs.existsSync(memoryBakDir)) fs.mkdirSync(memoryBakDir, { recursive: true });

// 群聊
const groupData = config.call.group;
spark.on('message.group.normal', async (pack, reply) => {
    if (!(groupData.enable // 总开关
        && (groupData.data.has(pack.group_id) || groupData.data.has("all"))
    )) return;

    if (pack.raw_message.startsWith("/aichat "))
        return onCommand(`${pack.group_id}`, pack, reply);

    // 接受所有消息
    if (groupData.all) return onMessage(`${pack.group_id}`, pack, reply);

    // 关键词
    if (groupData.keywords.length > 0
        && groupData.keywords.some(key => pack.raw_message.includes(key))
    ) return onMessage(`${pack.group_id}`, pack, reply);

    // at
    if (groupData.at
        && pack.message.some(i => (i.type === "at" && i.data.qq == pack.self_id))
    ) return onMessage(`${pack.group_id}`, pack, reply);
});

// 私聊
const privateData = config.call.private;
spark.on('message.private.friend', async (pack, reply) => {
    if (!(privateData.enable
        && (privateData.data.has(pack.user_id) || privateData.data.has("all"))
    )) return;

    if (pack.raw_message.startsWith("/aichat "))
        return onCommand(`target_${pack.user_id}`, pack, reply);

    onMessage(`target_${pack.user_id}`, pack, reply);
});

async function onCommand(uid, pack, reply) {
    const cmd = pack.raw_message.slice(8).split(" ");

    switch (cmd[0]) {
        case "memory": { // 记忆相关
            if (cmd[1] === "reload")
                return memoryMap.delete(uid);
        }
    }
}

async function onMessage(chatId, pack, reply) {
    callAPI(chatId, (await formatMsg(pack, 0)), (msg, res) => {
        let additionalMsg = "";

        // Token 显示
        const usage = res?.data?.usage;
        if (usage && config.reply.tokenInfo) {
            const tokenCost = (usage.completion_tokens / 1000000) * 2.8  // 输出2.8元/百万
                + ((usage?.prompt_cache_hit_tokens || 0) / 1000000) * 0.02 // 命中0.02元/百万
                + ((usage?.prompt_cache_miss_tokens || usage?.prompt_tokens) / 1000000) * 0.7; // 未命中0.7元/百万
            additionalMsg = `📊 Token消耗 (预计: ${tokenCost?.toFixed(6)} 元)`
                + `\n  ├─ 输入: ${usage?.prompt_tokens}`
                + `\n  │ ├─ 命中: ${usage?.prompt_cache_hit_tokens || 0}`
                + `\n  │ └─ 未命中: ${usage?.prompt_cache_miss_tokens || 0}`
                + `\n  ├─ 输出: ${usage?.completion_tokens}`
                + `\n  └─ 总计: ${usage?.total_tokens}`
                + `\n=================`
        };

        // 多次回复
        if (config.reply.linebreak.enable) {
            if (additionalMsg)
                reply(additionalMsg);

            let msgIndex = 0;
            msg
                .split(config.reply.linebreak.split)
                .filter(Boolean)
                .forEach(text => {
                    setTimeout(() => {
                        reply(text)
                    }, config.reply.linebreak.timeout * msgIndex);
                    msgIndex++
                });
        } else reply(additionalMsg + msg);
    });
}

// API 调用
async function callAPI(uid, data, callback = (() => { }), canAddMemory = true) {
    if (canAddMemory) addMemory(uid, 'user', data);

    try {
        const sendData = {
            model: config.ai.name,
            max_tokens: config.ai.maxTokens,
            temperature: config.ai.temperature,
            stream: false,
            tools: tools.definition,
            tool_choice: 'auto',
            messages: [
                { role: 'system', content: config.ai.system },
                ...getMemory(uid)
            ]
        };

        if (config.debug) logger.warn("QQ -> AI:\n" + JSON.stringify(sendData, null, 4));

        const response = await axios.post(config.ai.url, sendData, {
            headers: {
                'Authorization': `Bearer ${config.ai.key}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });

        if (config.debug) logger.warn("AI -> QQ:\n" + (JSON.stringify(response, (key, value) => {
            if (key === 'request' || key === 'config' || key === 'headers') return undefined;
            if (typeof value === 'bigint') return value.toString();
            return value;
        }, 4)));

        const message = response.data.choices[0].message;

        // 处理工具调用
        if (message.tool_calls && message.tool_calls.length > 0) {
            // 添加助手消息（包含工具调用）
            addMemory(uid, 'assistant', message.content || '', message.tool_calls);

            // 执行所有工具调用
            const toolResults = [];
            const chatData = {
                uid: uid,
                config: config
                // 以后想到了再加...
            };

            for (const toolCall of message.tool_calls) {
                const toolName = toolCall.function.name;
                const toolArgs = JSON.parse(toolCall.function.arguments || '{}');

                // 执行工具
                let toolResult;
                if (tools.calls[toolName]) {
                    try {
                        const argsArray = Object.values(toolArgs);
                        toolResult = await Promise.resolve(tools.calls[toolName](chatData, ...argsArray));
                        toolResult = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);
                    } catch (e) {
                        toolResult = `工具执行错误: ${e.message}`;
                        logger.error(`工具 ${toolName} 执行失败: ${e}`);
                    }
                } else {
                    toolResult = `未知工具: ${toolName}`;
                }

                toolResults.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: toolResult
                });
            }

            // 添加工具结果到记忆
            toolResults.forEach(result => addMemory(uid, result.role, result.content, null, result.tool_call_id));

            // 递归调用继续对话（不重复添加用户消息）
            if (message.content) callback(message.content, response);
            return callAPI(uid, data, callback, false);
        }

        // 处理普通文本回复
        if (message.content) {
            addMemory(uid, 'assistant', message.content);
            callback(message.content, response);
        }
    } catch (e) {
        logger.error('API 调用失败: ' + e);
        callback(`这道题有点难呢...我们等下再来学习吧!  ${e.message}`, null);
    }
}


// ==== 记忆管理相关 ==== //

// 获取记忆
function getMemory(uid) {
    if (memoryMap.has(uid)) return memoryMap.get(uid);

    const filePath = path.join(memoryDir, `${uid}.json`);
    let memory = [];

    if (fs.existsSync(filePath)) {
        try {
            const content = fs.readFileSync(filePath, 'utf8').trim();
            if (content) memory = JSON.parse(content);
        } catch (e) {
            logger.error(`读取记忆文件失败: ${filePath}`, e.message);
        }
    }

    // 合并连续的 user 消息（核心逻辑）
    const merged = memory.reduce((acc, msg) => {
        if (msg.role === 'user' && acc.length && acc[acc.length-1].role === 'user') {
            acc[acc.length-1].content += '\n' + msg.content;
        } else {
            acc.push({ ...msg });
        }
        return acc;
    }, []);
    
    memoryMap.set(uid, merged);
    return merged;
}

// 添加记忆
function addMemory(uid, role, content, tool_calls = null, tool_call_id = null) {
    let memory = getMemory(uid);
    if (!Array.isArray(memory)) {
        memory = [];
        memoryMap.set(uid, memory);
    }

    const message = { role, content };
    if (tool_calls) message.tool_calls = tool_calls;
    if (tool_call_id) message.tool_call_id = tool_call_id;

    memory.push(message);

    // 超出时备份
    if (memory.length > config.memory_length) {
        if (config.memory_bak) {
            const removed = memory.slice(0, memory.length - config.memory_length);
            const bakPath = path.join(memoryBakDir, `${uid}.json`);
            let bak = [];
            if (fs.existsSync(bakPath)) bak = JSON.parse(fs.readFileSync(bakPath, 'utf8'));
            bak.push(...removed);
            fs.writeFileSync(bakPath, JSON.stringify(bak, null, 2));
        }

        memory = memory.slice(-config.memory_length);
        memoryMap.set(uid, memory);
    }

    const filePath = path.join(memoryDir, `${uid}.json`);
    fs.writeFile(filePath, JSON.stringify(memory, null, 2), () => { });

    return memory;
}

// === 格式化消息相关 === //

// 合并连续的文本
function mergeText(messages, mergeFn) {
    const result = [];
    let textBuffer = [];

    for (const msg of messages) {
        if (msg.type === 'text') {
            // 文本类型：放入缓冲区
            textBuffer.push(msg);
        } else {
            // 非文本类型：先清空缓冲区，再添加当前元素
            if (textBuffer.length > 0) {
                result.push(mergeFn(textBuffer));
                textBuffer = [];
            }
            result.push(msg);
        }
    }

    // 处理最后可能残留的文本缓冲
    if (textBuffer.length > 0)
        result.push(mergeFn(textBuffer));
    return result;
}

async function formatMsg(pack, mode = 0) {
    if (mode === 0) { // 输入消息 (QQ -> AI)
        const qid = pack.sender.user_id;
        const name = pack.sender.card || pack.sender.nickname || qid;
        let msg = pack.message;

        msg = await Promise.all(
            msg.map(async (t) => {
                switch (t.type) {
                    case 'text': {
                        return {
                            type: "text",
                            text: t.data.text
                        };
                    }
                    case 'at': {
                        return {
                            type: "text",
                            text: `@${(await getUserName(pack.group_id, t.data.qq))}`
                        };
                    }
                    case 'image': {
                        if (!config.input.type.image) return { type: "text", text: "[image]" };
                        return {
                            type: "image_url",
                            image_url: {
                                url: t.data.url,
                                detail: "auto"
                            }
                        };
                    }
                    case 'audio': {
                        if (!config.input.type.audio) return { type: "text", text: "[audio]" };
                        return {
                            type: "audio_url",
                            audio_url: {
                                url: t.data.url
                            }
                        };
                    }
                    case 'video': {
                        if (!config.input.type.video) return { type: "text", text: "[video]" };
                        return {
                            type: "video_url",
                            video_url: {
                                url: t.data.url,
                                detail: "auto",
                                max_frames: 16,
                                fps: 1
                            }
                        };
                    }
                    case 'reply': {
                        const replyPack = await spark.QClient.getMsg(t.data.id);
                        return {
                            type: "text",
                            text: `---引用消息(CQ码)\n${
                                replyPack.raw_message
                                    .replace(/&#44;/g, ',')
                                    .replace(/&amp;/g, '&')
                                    .replace(/&#91;/g, '[')
                                    .replace(/&#93;/g, ']')
                            }\n---`
                        }
                    }
                    default:
                        return t;
                }
            })
        );

        if (config.input.msgFormat) {
            msg = [
                {
                    type: "text",
                    text: `[${new Date().toLocaleString('zh-CN', { hour12: false })}][${name}(${qid})] >> `
                },
                ...msg
            ]
        }

        msg = mergeText(msg, (textBuffer) => {
            return {
                type: "text",
                text: textBuffer.map(t => t.text).join('')
            };
        });

        return msg.filter(i => i !== undefined);
    } else if (mode === 1) { // 输出消息 (AI -> QQ)

    }
}

// 获取用户名称
async function getUserName(groupId, userId) {
    try {
        const info = await spark.QClient.getGroupMemberInfo(groupId, userId);
        return (info.card || info.nickname || `${userId}`);
    } catch (e) {
        return `${userId}`;
    }
}