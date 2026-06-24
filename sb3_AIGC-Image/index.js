const axios = require('axios');

// === 配置相关 === //
const configFile = spark.getFileHelper('AIGC');
configFile.initFile("config.json", {
    group: [spark.env.get("main_group")],
    group_all: false,
    private: [],
    private_all: true,

    cmd: "/生图 ",
    url: "https://apihub.agnes-ai.com/v1/images/generations",
    key: "sk-000000000000000000000000000000000000000000000000",
    model: "agnes-image-2.1-flash",
    timeout: 400000
})

// 网页配置
const config = JSON.parse(configFile.read("config.json"));
spark.web.createConfig()
    .array("group", config.group, "允许的群组")
    .switch("group_all", config.group_all, "允许所有群组")
    .array("private", config.private, "允许的私聊")
    .switch("private_all", config.private_all, "允许所有私聊")
    .text("cmd", config.cmd, "触发指令 （要带空格！）")
    
    .text("url", config.url, "AI 请求端点")
    .text("key", config.key, "AI 请求密钥")
    .text("model", config.model, "AI 请求模型名")
    .number("timeout", config.timeout, "AI 等待超时时间")
    .register();

spark.on("config.update.AIGC-Image", (key, val) => {
    config[key] = val;
    configFile.write('config.json', config);
});

// === 实际逻辑 === //

// 群聊
spark.on('message.group.normal', async (pack, reply) => {
    if (!((config.group_all
        || config.group.includes(pack.group_id))
        && pack.raw_message.startsWith(config.cmd)
    )) return;

    onMessage(pack, reply);
})

// 私聊
spark.on('message.private.friend', (pack, reply) => {
    if (!((config.private_all
        || config.private.includes(pack.target_id))
        && pack.raw_message.startsWith(config.cmd)
    )) return;

    onMessage(pack, reply);
});

async function onMessage(pack, reply) {
    reply("收到！正在努力绘画中~");

    // 提示词
    const prompt = (pack.message.map(t => {
        if (t.type === "text")
            return t.data.text;
    })).join(",").slice(config.cmd.length);

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
            spark.msgbuilder.reply(pack.real_id),
            spark.msgbuilder.text("画完啦～"),
            spark.msgbuilder.img(res.data.data[0].url)
        ]);
    } catch (err) {
        reply([
            spark.msgbuilder.reply(pack.real_id),
            spark.msgbuilder.text(`画不出来，怎么样都画不出来！>n<\n\n>> ${err}`),
        ]);
    }
}
