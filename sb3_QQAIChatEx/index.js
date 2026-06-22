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
            if (cmd[1] === "reload") {
                reply("缓存已清除");
                memoryMap.delete(uid);
            } else if (cmd[1] === "compress") {
                reply((await simpleCompress(uid)) + "");
                memoryMap.delete(uid);
            }
            break;
        }

        case "tool": {
            if (cmd[1] == null)
                return reply(Object.keys(tools));

            const toolsData = await Promise.resolve(
                tools.calls[cmd[1]]({
                    uid: uid,
                    pack: pack,
                    config: config
                }, ...cmd.slice(2))
            );
            reply(toolsData);
            break;
        }

        case "config": {
            if (cmd[1] === "set") {
                if (cmd.length < 3) {
                    reply("用法: /aichat config set <路径>=<值>");
                    break;
                }
                try {
                    const setExpr = cmd.slice(2).join(' ').trim();
                    const eqIndex = setExpr.indexOf('=');
                    if (eqIndex === -1) {
                        reply("格式错误，需要 '=' 分隔");
                        break;
                    }
                    const path = setExpr.substring(0, eqIndex).trim();
                    const valueStr = setExpr.substring(eqIndex + 1).trim();

                    // 自动类型转换
                    let value;
                    try {
                        value = JSON.parse(valueStr);
                    } catch {
                        value = valueStr; // 无法解析则保持字符串
                    }

                    // 深度设置
                    const keys = path.split('.');
                    let obj = config;
                    for (let i = 0; i < keys.length - 1; i++) {
                        if (!(keys[i] in obj)) obj[keys[i]] = {};
                        obj = obj[keys[i]];
                    }
                    obj[keys[keys.length - 1]] = value;

                    // 保存配置
                    const configPath = path.join(__dirname, 'Config/config.js');
                    const configContent = `module.exports = ${JSON.stringify(config, null, 4)};`;
                    fs.writeFileSync(configPath, configContent, 'utf8');

                    reply(`✅ 已设置 ${path} = ${JSON.stringify(value)}`);
                } catch (e) {
                    reply(`❌ 设置失败: ${e.message}`);
                }
            } else if (cmd[1] === "get") {
                if (cmd.length < 3) {
                    reply("用法: /aichat config get <路径>");
                    break;
                }
                const path = cmd.slice(2).join('.').trim();
                const keys = path.split('.');
                let obj = config;
                let valid = true;

                for (const key of keys) {
                    if (obj && typeof obj === 'object' && key in obj) {
                        obj = obj[key];
                    } else {
                        valid = false;
                        break;
                    }
                }

                if (!valid) {
                    reply(`❌ 路径不存在: ${path}`);
                    break;
                }

                // 敏感配置过滤
                const sensitiveKeys = ['key'];
                const lastKey = keys[keys.length - 1].toLowerCase();
                if (sensitiveKeys.some(sk => lastKey.includes(sk))) {
                    reply(`${path}=***`);
                } else {
                    const value = typeof obj === 'object' ? JSON.stringify(obj) : obj;
                    reply(`${path}=${value}`);
                }
            } else {
                reply("用法: /aichat config <set|get> [参数]");
            }
            break;
        }

        case "cmddata": {
            reply(JSON.stringify(cmd, null, 4));
            break;
        }
    }
}

async function onMessage(chatId, pack, reply) {
    callAPI(chatId, (await formatMsg(pack, 0)), pack, (msg, res) => {
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
            let textToSplit = msg;
            let codeMap = null;

            if (config.reply.linebreak.codeBlock) {
                codeMap = new Map();
                textToSplit = msg.replace(/```[\s\S]*?```/g, (match) => {
                    const id = `__CODE_${codeMap.size}__`;
                    codeMap.set(id, match.replace(/```\w*\n|```$/g, ''));
                    return id;
                });
            }

            textToSplit
                .split(config.reply.linebreak.split)
                .filter(Boolean)
                .map(text => codeMap ? text.replace(/__CODE_\d+__/g, m => codeMap.get(m)) : text)
                .forEach(text => {
                    setTimeout(() => {
                        reply(text)
                    }, config.reply.linebreak.timeout * msgIndex);
                    msgIndex++
                });
        } else reply(additionalMsg + msg);
    });
}

// === 其他插件注册工具 === //
spark.on("core.ready", () => {
    setTimeout(() => {
        spark.emit("event.aichat.starts", Date.now())
    }, 3000)
})

spark.on("event.aichat.add_tools", (name, tool) => {
    const { definition, call } = tool;

    definition.function.name = name;
    tools.definition.push(definition);
    tools.calls[name] = call;
})

// API 调用
async function callAPI(uid, data, pack, callback = (() => { }), canAddMemory = true, is_fullback = false) {
    if (canAddMemory) addMemory(uid, 'user', data);

    const fallbackConfig = {
        name: is_fullback ? config.ai.fallback.name : config.ai.name,
        url: is_fullback ? config.ai.fallback.url : config.ai.url,
        key: is_fullback ? config.ai.fallback.key : config.ai.key
    };

    try {
        const sendData = {
            model: fallbackConfig.name,
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

        const response = await axios.post(fallbackConfig.url, sendData, {
            headers: {
                'Authorization': `Bearer ${fallbackConfig.key}`,
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
                pack: pack,
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
                        logger.error(`[QQAIChatEx] 工具 ${toolName} 执行失败: ${e}`);
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
            return callAPI(uid, data, pack, callback, false);
        }

        // 处理普通文本回复
        if (message.content) {
            addMemory(uid, 'assistant', message.content);
            callback(message.content, response);
        }
    } catch (e) {
        logger.error('[QQAIChatEx] API 调用失败: ' + e);
        if (!is_fullback) {
            callback(`主模型响应失败，尝试调用备用模型 ${config.ai.fallback.name}...`, null)
            return callAPI(uid, data, pack, callback, false, true);
        }

        callback(`这道题有点难呢...我们等下再来学习吧!\n${e.message}`, null);
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
            logger.error(`[QQAIChatEx] 读取记忆文件失败: ${filePath}`, e.message);
        }
    }

    // 合并连续的 user 消息（核心逻辑）
    const merged = memory.reduce((acc, msg) => {
        if (msg.role === 'user' && acc.length && acc[acc.length - 1].role === 'user') {
            acc[acc.length - 1].content += '\n' + msg.content;
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

    // 超出时备份并裁剪
    if (memory.length > config.memory.length) {
        if (config.memory.bak) {
            const removed = memory.slice(0, memory.length - config.memory.length);
            const bakPath = path.join(memoryBakDir, `${uid}.json`);
            let bak = [];
            if (fs.existsSync(bakPath)) bak = JSON.parse(fs.readFileSync(bakPath, 'utf8'));
            bak.push(...removed);
            fs.writeFileSync(bakPath, JSON.stringify(bak, null, 2));
        }

        // 安全裁剪：确保不拆散 tool_calls 配对
        memory = safeSlice(memory, config.memory.length);
        memoryMap.set(uid, memory);
    }

    const filePath = path.join(memoryDir, `${uid}.json`);
    fs.writeFile(filePath, JSON.stringify(memory, null, 2), () => { });

    return memory;
}

// 安全裁剪：保持消息完整性
function safeSlice(memory, maxLength) {
    // 从后往前保留，确保工具调用对不被拆散
    const keep = memory.slice(-maxLength);

    // 检查第一条保留的消息是否是孤立的 tool 消息
    if (keep.length > 0 && keep[0].role === 'tool' && keep[0].tool_call_id) {
        // 向前查找对应的 assistant 消息
        const startIndex = memory.length - maxLength;
        for (let i = startIndex - 1; i >= 0; i--) {
            if (memory[i].role === 'assistant' &&
                memory[i].tool_calls?.some(tc => tc.id === keep[0].tool_call_id)) {
                // 找到了，把这对一起保留
                const realKeep = memory.slice(i);
                return realKeep.slice(-maxLength - 1); // 多保留一条，确保不超过限制太多
            }
        }
        // 找不到配对的 assistant，移除这个孤立的 tool 消息
        return keep.slice(1);
    }

    // 检查最后一条移除的消息是否是带 tool_calls 的 assistant
    if (memory.length > maxLength) {
        const removedAssistant = memory[memory.length - maxLength - 1];
        if (removedAssistant?.role === 'assistant' && removedAssistant.tool_calls) {
            // 移除 keep 中对应的 tool 消息
            const toolIds = new Set(removedAssistant.tool_calls.map(tc => tc.id));
            const filtered = keep.filter(msg =>
                !(msg.role === 'tool' && toolIds.has(msg.tool_call_id))
            );
            return filtered;
        }
    }

    return keep;
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
                            text: `---引用消息(CQ码)\n${replyPack.raw_message
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
                    text: ` [${new Date().toLocaleString('zh-CN', { hour12: false })}][${name}(${qid})] >> `
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

// === 对话压缩 === //

// 简单压缩：移除工具调用对
function simpleCompress(uid) {
    const memory = getMemory(uid);
    if (!memory || memory.length === 0) return memory;

    const compressed = [];
    const toRemoveIds = new Set();

    // 标记所有需要移除的 tool_call_id
    for (let i = 0; i < memory.length; i++) {
        const msg = memory[i];
        if (msg.role === 'assistant' && msg.tool_calls) {
            // 标记该助手消息本身
            toRemoveIds.add(i);
            // 标记对应的 tool 消息
            for (const toolCall of msg.tool_calls) {
                for (let j = i + 1; j < memory.length; j++) {
                    if (memory[j].role === 'tool' && memory[j].tool_call_id === toolCall.id) {
                        toRemoveIds.add(j);
                        break;
                    }
                }
            }
        }
    }

    // 构建压缩后的记忆
    for (let i = 0; i < memory.length; i++) {
        if (!toRemoveIds.has(i)) {
            compressed.push(memory[i]);
        }
    }

    // 更新记忆
    memoryMap.set(uid, compressed);
    const filePath = path.join(memoryDir, `${uid}.json`);
    fs.writeFileSync(filePath, JSON.stringify(compressed, null, 2));

    return `简单压缩完成: ${memory.length} -> ${compressed.length} 条消息`;
}