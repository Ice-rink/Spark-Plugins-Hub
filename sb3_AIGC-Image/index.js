const msgbuilder = require('../../handles/msgbuilder');
const axios = require('axios');

const config = {
    // QQ群
    // 输入all匹配使用群
    QQGroup: new Set([1029879634, 759676433, "all"]),

    key: "sk-000000000000000000000000000000000000000000000000", // 请求密钥
    url: "https://apihub.agnes-ai.com/v1/images/generations", // 请求的ai端点
    model: "agnes-image-2.1-flash", // 图片生成大模型
    timeout: 400000 // 等待时长
};

// 群聊
spark.on('message.group.normal', async (pack, reply) => {
    if (!((config.QQGroup.has("all")
        || config.QQGroup.has(pack.group_id))
        && pack.raw_message.startsWith("/生图 ")
    )) return;

    onMessage(pack, reply);
})

// 私聊
spark.on('message.private.friend', (pack, reply) => {
    if (!((config.QQPrivate.has("all")
        || config.QQPrivate.has(pack.target_id))
        && pack.raw_message.startsWith("/生图 ")
    )) return;

    onMessage(pack, reply);
});

async function onMessage(pack, reply) {
    reply("收到！正在努力绘画中~");

    // 提示词
    const prompt = (pack.message.map(t => {
        if (t.type === "text")
            return t.data.text;
    })).join(",").slice(4);

    // 图片列表
    const images = (pack.message.map(t => {
        if (t.type === "image")
            return t.data.url
    })).filter(i => i != null);

    sendImage(null, pack, prompt, images, reply)
}

// 导出AI调用工具
spark.on("event.aichat.starts", () => {
    spark.emit("event.aichat.add_tools", "generate_images", {
        definition: {
            type: "function",
            function: {
                description: "文生图片接口，生成完成后会自动发送，如需图生图请引导用户使用 '/生图 <prompt>'指令",
                parameters: {
                    type: "object",
                    properties: {
                        prompt: {
                            type: "string",
                            description: "生图提示词",
                        },
                    },
                    required: ["prompt"]
                }
            }
        },
        call: (chatData, prompt) => {
            sendImage(chatData.uid, chatData.pack, prompt);
            return "图片生成请求已发送，生成完毕后会自动发送至请求群聊";
        }
    })
})

async function sendImage(uid, pack, prompt, images = [], reply = null) {
    if (reply === null) {
        if (uid.startsWith("target_"))
            reply = (...msg) => spark.QClient.sendPrivateMsg(uid.slice(7), ...msg);
        else
            reply = (...msg) => spark.QClient.sendGroupMsg(uid, ...msg);
    }

    try {
        const data = {
            model: config.model,
            prompt: prompt,
            extra_body: {
                response_format: "url"
            },
        };
        if (images.length > 0) data.extra_body["image"] = [...images];

        const res = await axios.post(config.url,
            data,
            {
                headers: {
                    'Authorization': `Bearer ${config.key}`,
                    'Content-Type': 'application/json'
                },
                timeout: config.timeout
            }
        );

        reply([
            msgbuilder.reply(pack.real_id),
            msgbuilder.text(" 画完啦～"),
            msgbuilder.img(res.data.data[0].url)
        ]);
    } catch (err) {
        reply([
            msgbuilder.reply(pack.real_id),
            msgbuilder.text(`画不出来，怎么样都画不出来！>n<\n\n>> ${err}`),
        ]);
    }
}
