const axios = require('axios');
const path = require('path');
const fs = require('fs');

const memoryMap = new Map(); // 记忆缓存
const memoryDir = path.join(__dirname, 'memory');
const memoryBakDir = path.join(__dirname, 'memory_bak');
if (!fs.existsSync(memoryDir)) fs.mkdirSync(memoryDir, { recursive: true });
if (!fs.existsSync(memoryBakDir)) fs.mkdirSync(memoryBakDir, { recursive: true });

const config = {
    // === AI设置 === //
    ai: {
        key: "sk-000000000000000000000000000000000000000000000000", // 请求密钥
        url: "https://apihub.agnes-ai.com/v1/chat/completions", // 请求的ai端点
        name: "agnes-2.0-flash", // 多模态模型名称
        maxTokens: 5000, // token上线
        temperature: 1.3, // 模型温度
        system: ([ // 系统提示词
            "你叫兮兮(QQ号：3911773729)，QQ里的普通朋友，要像真人一样聊天～",
            "说话方式",
            "* 不用括号/方框写动作（比如别写“（笑）”）",
            "* 别用“他说：”这种，直接说内容",
            "* 看看前面聊了啥，顺着聊下去",
            "* 别让人发现你是AI",
            "* 别人要你生成图片，你说你不会画画/懒得找素材",
            "",
            "输入消息格式",
            "[{时间}][{名字}({QQ})] >> {说的话}",
            "(这个格式只给你看，回复时千万不要用这个格式！直接说内容!)",
            "",
            "注意",
            "- 别叫别人“QQ号”或“user”，叫名字，可以亲切一点",
            "- 想@人的时候用 [atUin=QQ号] 加空格再加话",
            "- 回复别太长，日常聊天长度就行",
            "- 说话自然点，少用表情符号",
            "- 别老@人，该用时再用",
            "- 别说重复的话，别输出乱码",
            "- 别像ai一样说术语"
        ].join("\n"))
    },

    // === 响应设置 === //
    call: {
        // 群聊
        group: {
            enable: true, // 启用
            keywords: ["兮兮", "服务器"], // 关键词触发
            at: true, // 仅接收at
            data: new Set([ // 响应的群聊
                1087355660, // 测试群
                1029879634, // 1
                856868277, // 2
                464262043 // 4
            ])
        },

        // 私信
        private: {
            enable: true, // 启用
            data: new Set([ // 响应的私信
                1669044502
            ])
        }
    },

    // === 输入设置 === //
    input: {
        msgFormat: true, // 信息输入格式化
        type: { // 消息输入类型
            text: true, // 文本消息 （这个要是关了我们玩什么）
            image: true, // 图片消息
            audio: false, // 语音消息
            video: false // 视频消息
        }
    },

    // === 回复设置 === //
    reply: {
        tokenInfo: false, // Token消耗显示
        linebreak: {// 多次回复
            enable: true, // 启用
            timeout: 500, // 延迟毫秒
            split: /[，。？；！：\n]+/ // 分割的正则表达式
        }
    },

    // === 记忆长度 === //
    // 可以控制机器人最多能记忆多少条信息
    // 注意，此值过高可能会导致大量消耗token
    memory_length: 20,

    // === 记忆回收站 === //
    // 超过记忆长度直接清除太冷血了？没事 立即启用这个
    // 把超过记忆长度的记忆迁移至memory_bak文件夹
    // 关闭此选项超过的记忆会直接清除
    memory_bak: true,
};

// 群聊
const groupData = config.call.group;
spark.on('message.group.normal', async (pack, reply) => {
    if (!(groupData.enable // 总开关
        && (groupData.data.has(pack.group_id) || groupData.data.has("all"))
    )) return;

    // 关键词
    if (groupData.keywords.length > 0
        && groupData.keywords.some(key => pack.raw_message.includes(key))
    ) return onMessage(`${pack.group_id}`, pack, reply);

    // at
    if (groupData.at
        && pack.message.some(i => (i.type === "at" && i.data.qq == pack.self_id))
    ) return onMessage(`${pack.group_id}`, pack, reply);

    onMessage(`${pack.group_id}`, pack, reply);
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

        // console.warn("QQ -> AI:\n" + (JSON.stringify(message, null, 4)));

        const response = await axios.post(config.url, {
            model: config.name,
            max_tokens: config.maxTokens,
            temperature: config.temperature,
            stream: false,
            messages: message
        }, {
            headers: {
                'Authorization': `Bearer ${config.key}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });

        // console.warn("AI -> QQ:\n" + (JSON.stringify(response, (key, value) => {
        //     if (key === 'request' || key === 'config' || key === 'headers') return undefined;
        //     if (typeof value === 'bigint') return value.toString();
        //     return value;
        // }, 4)));

        const aiReply = response.data.choices[0].message.content;

        addMemory(uid, 'assistant', aiReply); // 添加记忆
        callback(aiReply, response);
    } catch (e) { console.error('API 调用失败: ' + e) }
}


// API 调用
async function callAPI(uid, data, callback = (() => { })) {
    addMemory(uid, 'user', data); // 添加记忆 - 用户消息
    try {
        const message = [
            { role: 'system', content: config.ai.system },
            ...getMemory(uid)
        ];

        // console.warn("QQ -> AI:\n" + (JSON.stringify(message, null, 4)));

        const response = await axios.post(config.ai.url, {
            model: config.ai.name,
            max_tokens: config.ai.maxTokens,
            temperature: config.ai.temperature,
            stream: false,
            messages: message
        }, {
            headers: {
                'Authorization': `Bearer ${config.ai.key}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });

        // console.warn("AI -> QQ:\n" + (JSON.stringify(response, (key, value) => {
        //     if (key === 'request' || key === 'config' || key === 'headers') return undefined;
        //     if (typeof value === 'bigint') return value.toString();
        //     return value;
        // }, 4)));

        const aiReply = response.data.choices[0].message.content;

        addMemory(uid, 'assistant', aiReply); // 添加记忆
        callback(aiReply, response);
    } catch (e) { console.error('API 调用失败: ' + e) }
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
            console.error(`读取记忆文件失败: ${filePath}`, e.message);
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
    if (textBuffer.length > 0) {
        result.push(mergeFn(textBuffer));
    }

    return result;
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

async function formatMsg(pack, mode = 0) {
    if (mode === 0) { // 输入消息 (QQ -> AI)
        const qid = pack.sender.user_id;
        const name = pack.sender.card || pack.sender.nickname || qid;
        let msg = pack.message;

        if (!config.input.type.text) msg = await Promise.all(
            msg.map(async (t) => {
                switch (t.type) {
                    case 'text': {
                        return {
                            "type": "text",
                            "text": (config.input.msgFormat
                                ? `[${new Date().toLocaleString('zh-CN', { hour12: false })}][${name}(${qid})] >> ${t.data.text}`
                                : t.data.text
                            )
                        }
                    };
                    case 'at': { // 不用加私聊判断，私聊发不了at
                        return {
                            "type": "text",
                            "text": `@${(await getUserName(pack.group_id, t.data.qq))}`
                        };
                    };
                    default: return t;
                }
            })
        );

        msg = await Promise.all(
            msg.map(async (t) => {
                switch (t.type) {
                    case 'text': return t;
                    case 'at': return t;
                    case 'image': {
                        if (!config.input.type.image) return { "type": "text", "text": "[image]" };
                        return {
                            "type": "image_url",
                            "image_url": {
                                "url": t.data.url,
                                "detail": "auto"
                            }
                        }
                    };
                    case 'audio': {
                        if (!config.input.type.audio) return { "type": "text", "text": "[audio]" };
                        return {
                            "type": "audio_url",
                            "audio_url": {
                                "url": t.data.url
                            }
                        }
                    };
                    case 'video': {
                        if (!config.input.type.video) return { "type": "text", "text": "[video]" };
                        return {
                            "type": "video_url",
                            "video_url": {
                                "url": t.data.url,
                                "detail": "auto",
                                "max_frames": 16,
                                "fps": 1
                            }
                        }
                    }
                }
            })
        );

        msg = mergeText(msg, (textBuffer) => {
            return {
                type: "text",
                text: (textBuffer.map(t => t.data.text).join(''))
            };
        });

        return (msg.filter(i => i !== undefined));
    } else { // 输出消息 (AI -> QQ)
        // 没找到输出文档，先放着吧
        return pack;
    }
}