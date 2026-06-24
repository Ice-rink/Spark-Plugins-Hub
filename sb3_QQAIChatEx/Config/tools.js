const axios = require('axios');

const tools = {
    // 外置视觉模型
    "look_image_info": {
        definition: {
            type: "function",
            function: {
                description: "调用外置视觉模型分析图片内容，一次一张图片",
                parameters: {
                    type: "object",
                    properties: {
                        url: {
                            type: "string",
                            description: "图片url",
                        },
                        prompt: {
                            type: "string",
                            description: "对视觉模型的提问词，应当明确要求，避免让模型返回过多文字",
                        },
                    },
                    required: ["url", "prompt"]
                }
            }
        },
        call: async (chatData, url, prompt) => {
            if (!chatData.config.ai.look.enable)
                return "视觉模型未启用";

            try {
                const lookai = chatData.config.ai.look;
                const data = await axios.post(lookai.url, {
                    model: lookai.name,
                    max_tokens: 2000,
                    temperature: chatData.config.ai.temperature,
                    stream: false,
                    messages: [
                        { role: "system", content: "你是一个专业的图片识别模型" },
                        {
                            role: "user", content: [
                                {
                                    "type": "text",
                                    "text": prompt
                                },
                                {
                                    type: "image_url",
                                    image_url: {
                                        url: url
                                    }
                                }
                            ]
                        }
                    ]
                }, {
                    headers: {
                        'Authorization': `Bearer ${lookai.key}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                });
                return data.data.choices ?? JSON.stringify(data, (key, value) => {
                    if (key === 'request' || key === 'config' || key === 'headers') return undefined;
                    if (typeof value === 'bigint') return value.toString();
                    return value;
                });
            } catch (e) {
                return `分析失败，可尝试再次调用此工具，最多可尝试10次\n${e}`;
            }

        }
    },

    // 发送WS原始数据包
    "send_ws_pack": {
        definition: {
            type: "function",
            function: {
                description: "发送NapCat的WS原始数据包，如果你不会用请不要调用，这可能导致程序崩溃",
                parameters: {
                    type: "object",
                    properties: {
                        action: {
                            type: "string",
                            description: "动作",
                        },
                        params: {
                            type: "string",
                            description: "动作内部数据，JSON对象格式",
                        },
                    },
                    required: ["action", "params"]
                }
            }
        },
        call: async (chatData, action, params) => {
            return await request(action, JSON.parse(params))
        }
    },

    // 发送截一截消息
    "send_poke": {
        definition: {
            type: "function",
            function: {
                description: "对用户截一截",
                parameters: {
                    type: "object",
                    properties: {
                        qq: {
                            type: "string",
                            description: "对方QQ号",
                        }
                    },
                    required: ["qq"]
                }
            }
        },
        call: async (chatData, qq) => {
            let msg = "";
            if (chatData.uid.startsWith("target_")) {
                msg = await request('friend_poke', {
                    user_id: chatData.uid.slice(7)
                });
            } else {
                msg = await request('group_poke', {
                    group_id: chatData.uid,
                    user_id: qq
                });
            }
            return msg;
        }
    },

    // 查询群聊人员列表
    "query_group_member_list": {
        definition: {
            type: "function",
            function: {
                description: "查询当前群聊人员列表",
                parameters: {
                    type: "object",
                    properties: {},
                    required: []
                }
            }
        },
        call: async (chatData) => {
            if (chatData.uid.startsWith("target_"))
                return "当前为私聊环境，无需查询";

            const data = await request("get_group_member_list", {
                group_id: chatData.uid
            })

            data = data.data;
            return data.map((user) => {
                return {
                    user_id: user.user_id,
                    nickname: user.nickname,
                    card: user.card,
                    level: user.level,
                    role: user.role,
                    title: user.title,
                    join_time: user.join_time,
                    last_sent_time: user.last_sent_time,
                    is_robot: user.is_robot,
                    shut_up_timestamp: user.shut_up_timestamp
                }
            })
        }
    },

    // 查询用户信息
    "query_user_info": {
        definition: {
            type: "function",
            function: {
                description: "当需要查询用户信息时调用",
                parameters: {
                    type: "object",
                    properties: {
                        qq: {
                            type: "string",
                            description: "被查询者QQ号",
                        }
                    },
                    required: ["qq"]
                }
            }
        },
        call: async (chatData, qq) => {
            let data = {};

            if (chatData.uid.startsWith("target_")) {
                data = await request('get_stranger_info', {
                    user_id: chatData.uid.slice(7),
                    no_cache: true
                });
            } else {
                data = await request('get_group_member_info', {
                    group_id: chatData.uid,
                    user_id: qq
                });
            };

            data = data.data;
            return {
                qq: data.uin,
                name: data.nick,
                remark: data.remark,
                sex: data.sex,
                age: data.age,
                longNick: data.longNick,
                qqLevel: data.qqLevel,
                richTime: data.richTime,
                birthday: `${data.birthday_year}-${data.birthday_month}-${data.birthday_day}`,
                address: `${country}-${province}-${city}`
            }
        }
    },

    // 知识库
    "query_knowledge_data": {
        definition: {
            type: "function",
            function: {
                description: "当用户询问特定知识时，调用此工具查询相关信息，确保关键词简洁，如空返回可再次调用",
                parameters: {
                    type: "object",
                    properties: {
                        query: {
                            type: "string",
                            description: "要搜索的关键词;输入 all 获取所有;可使用空格分隔多个关键词",
                        }
                    },
                    required: ["query"]
                }
            }
        },
        call: async (chatData, query) => {
            return await chatData.config.ai.knowledge(query);
        }
    },

    // 获取聊天记录
    "query_chat_data": {
        definition: {
            type: 'function',
            function: {
                description: '获取当前对话的历史消息记录。可以获取最近的消息，支持自定义数量和排序方向。',
                parameters: {
                    type: 'object',
                    properties: {
                        count: {
                            type: 'integer',
                            description: '要获取的消息数量，默认10条，最大为400',
                            default: 10,
                            minimum: 1,
                            maximum: 400
                        },
                        reverseOrder: {
                            type: 'boolean',
                            description: '消息排序方向。true=从旧到新（最早的消息在前），false=从新到旧（最新的消息在前）',
                            default: false
                        }
                    },
                    required: ["count"]
                }
            }
        },
        call: async (chatData, count = 10, reverseOrder = false) => {
            count = +count;
            reverseOrder = Boolean(reverseOrder);

            try {
                let msgList = {};

                if (chatData.uid.startsWith("target_")) {
                    msgList = await request('get_friend_msg_history', {
                        user_id: chatData.uid.slice(7),
                        message_seq: 0,
                        count: count,
                        reverseOrder: reverseOrder
                    });
                } else {
                    msgList = await request('get_group_msg_history', {
                        group_id: chatData.uid,
                        count: count,
                        reverseOrder: reverseOrder
                    });
                }

                // 预定义格式化函数
                function formatTimestamp(timestamp) {
                    const date = new Date(timestamp * 1000);
                    const year = date.getFullYear();
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    const day = String(date.getDate()).padStart(2, '0');
                    const hours = String(date.getHours()).padStart(2, '0');
                    const minutes = String(date.getMinutes()).padStart(2, '0');
                    const seconds = String(date.getSeconds()).padStart(2, '0');
                    return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
                };

                // 批量处理
                msgList = msgList?.data?.messages?.map(msg => {
                    if (msg?.message?.[0]?.data?.text?.startsWith("📊 Token消耗")) return;
                    const timeStr = formatTimestamp(msg.time);
                    const sender = msg.sender.card || msg.sender.nickname;
                    return `[${timeStr}][${sender} (${msg.sender.user_id})] >> ${msg.raw_message}`;
                });

                return JSON.stringify(msgList, (key, value) => {
                    if (key === 'request' || key === 'config' || key === 'headers') return undefined;
                    if (typeof value === 'bigint') return value.toString();
                    return value;
                }) ?? "null";

            } catch (error) {
                logger.error(`获取聊天记录失败: ${error.message}`);
                return "null";
            }
        }
    }
};

// === 辅助函数 === //
const pendingRequests = new Map();
spark.on('gocq.pack', (pack) => {
    if (!pack.echo) return;
    const pending = pendingRequests.get(pack.echo);
    if (!pending) return;
    clearTimeout(pending.timer);
    pending.resolve(pack);
    pendingRequests.delete(pack.echo);
});

function request(action, params, timeout = 10000) {
    return new Promise((resolve, reject) => {
        const echoId = `${action}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const timer = setTimeout(() => {
            const pending = pendingRequests.get(echoId);
            if (pending) {
                pendingRequests.delete(echoId);
                reject(new Error(`${action} 请求超时`));
            }
        }, timeout);
        pendingRequests.set(echoId, { resolve, reject, timer });
        spark.QClient.sendWSPack({
            action: action,
            echo: echoId,
            params: params
        });
    });
}

module.exports = ((tools) => {
    const result = { definition: [], calls: {} };
    for (const [name, tool] of Object.entries(tools)) {
        const def = JSON.parse(JSON.stringify(tool.definition));
        def.function.name = name;
        result.definition.push(def);
        result.calls[name] = tool.call;
    }
    return result;
})(tools);