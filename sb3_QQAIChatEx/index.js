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

    onMessage(`target_${pack.user_id}`, pack, reply);
});

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

async function callAI(uid, data, callback = (() => { })) {
    addMemory(uid, 'user', data); // 添加记忆 - 用户消息
    try {
        const message = [
            { role: 'system', content: config.system },
            ...getMemory(uid)
        ];

        // logger.warn("QQ -> AI:\n" + (JSON.stringify(message, null, 4)));

        const response = await axios.post(config.url, {
            model: config.name,
            max_tokens: config.maxTokens,
            temperature: config.temperature,
            tools: config.ai.tools ?? [],
            stream: false,
            messages: message
        }, {
            headers: {
                'Authorization': `Bearer ${config.key}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });

        logger.warn("AI -> QQ:\n" + (JSON.stringify(response, (key, value) => {
            if (key === 'request' || key === 'config' || key === 'headers') return undefined;
            if (typeof value === 'bigint') return value.toString();
            return value;
        }, 4)));

        const aiReply = response.data.choices[0].message.content;

        addMemory(uid, 'assistant', aiReply); // 添加记忆
        callback(aiReply, response);
    } catch (e) { logger.error('API 调用失败: ' + e) }
}


// API 调用
async function callAPI(uid, data, callback = (() => { })) {
    addMemory(uid, 'user', data); // 添加记忆 - 用户消息
    try {
        const sendData = {
            model: config.ai.name,
            max_tokens: config.ai.maxTokens,
            temperature: config.ai.temperature,
            stream: false,
            tools: tools.definition,
            messages: [
                { role: 'system', content: config.ai.system },
                ...getMemory(uid)
            ]
        }

        logger.warn("QQ -> AI:\n" + (JSON.stringify(sendData, null, 4)));
        const response = await axios.post(config.ai.url, sendData, {
            headers: {
                'Authorization': `Bearer ${config.ai.key}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });

        logger.warn("AI -> QQ:\n" + (JSON.stringify(response, (key, value) => {
            if (key === 'request' || key === 'config' || key === 'headers') return undefined;
            if (typeof value === 'bigint') return value.toString();
            return value;
        }, 4)));

        const aiReply = response.data.choices[0].message.content;

        addMemory(uid, 'assistant', aiReply); // 添加记忆
        callback(aiReply, response);
    } catch (e) { logger.error('API 调用失败: ' + e) }
}

// 调用工具
function callTools(name, ...query) {
    if (tools.calls[name] === null) return ["未知的工具"];

    // return await tools.calls[name](...query);
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
            if (content) {
                const parsed = JSON.parse(content);
                memory = Array.isArray(parsed) ? parsed : [];
            }
        } catch (e) {
            logger.error(`读取记忆文件失败: ${filePath}`, e.message);
            if (fs.existsSync(filePath)) fs.renameSync(filePath, filePath + '.bak');
        }
    }

    memoryMap.set(uid, memory);
    return memory;
}

// 添加记忆
function addMemory(uid, role, content) {
    let memory = getMemory(uid);
    if (!Array.isArray(memory)) {
        memory = [];
        memoryMap.set(uid, memory);
    }

    memory.push({ role, content });

    // 超出时备份
    if (memory.length > config.memory_length) {
        if (config.memory_bak) { // 记忆备份文件
            const removed = memory.slice(0, memory.length - config.memory_length);
            const bakPath = path.join(memoryBakDir, `${uid}.json`);

            let bak = [];
            if (fs.existsSync(bakPath)) bak = JSON.parse(fs.readFileSync(bakPath, 'utf8'));
            bak.push(...removed);
            fs.writeFileSync(bakPath, JSON.stringify(bak, null, 2));
        }

        // 保留最后N条
        memory = memory.slice(-config.memory_length);
        memoryMap.set(uid, memory);
    }

    // 写入当前记忆
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
                            text: (config.input.msgFormat
                                ? `[${new Date().toLocaleString('zh-CN', { hour12: false })}][${name}(${qid})] >> ${t.data.text}`
                                : t.data.text)
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
                    default:
                        return t;
                }
            })
        );

        msg = mergeText(msg, (textBuffer) => {
            return {
                type: "text",
                text: textBuffer.map(t => t.text).join('')
            };
        });

        return msg.filter(i => i !== undefined);
    } else { } // 输出消息 (AI -> QQ)
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