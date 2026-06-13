const axios = require('axios');
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

module.exports = {
    definition: [
        {
            type: "function",
            function: {
                name: "query_knowledge_data",
                description: "当用户询问服务器规则、技术文档等特定知识时，调用此工具查询相关信息",
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
        {
            type: 'function',
            function: {
                name: 'query_chat_data',
                description: '获取当前对话的历史消息记录。可以获取最近的消息，支持自定义数量和排序方向。',
                parameters: {
                    type: 'object',
                    properties: {
                        count: {
                            type: 'integer',
                            description: '要获取的消息数量，默认20条，最大为40',
                            default: 40,
                            minimum: 1,
                            maximum: 40
                        },
                        reverseOrder: {
                            type: 'boolean',
                            description: '消息排序方向。true=从旧到新（最早的消息在前），false=从新到旧（最新的消息在前）',
                            default: false
                        }
                    },
                    required: ['chatData']
                }
            }
        }
    ],
    calls: {
        // 知识库
        query_knowledge_data: async (chatData, query) => {
            return await chatData.config.ai.knowledge(query);
        },

        // 获取聊天记录
        query_chat_data: async (chatData, count = 20, reverseOrder = false) => {
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
}