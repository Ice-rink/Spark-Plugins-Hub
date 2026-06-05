const msgbuilder = require('../../handles/msgbuilder');
const axios = require('axios');

const config = {
    // QQ群
    // 输入all匹配使用群
    QQGroup: new Set([1029879634, 759676433, "all"]),

    key: "sk-000000000000000000000000000000000000000000000000", // 请求密钥
    url: "https://apihub.agnes-ai.com/v1/images/generations", // 请求的ai端点
    model: "agnes-image-2.1-flash", // 图片生成大模型
    timeout: 30000 // 等待时长
};

// send msg
spark.on('message.group.normal', async (pack, reply) => {
    if (!((config.QQGroup.has("all")
        || config.QQGroup.has(pack.group_id))
        && pack.raw_message.startsWith("/生图 ")
    )) return;

    reply("收到！正在努力绘画中~");

    try {

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

        const data = {
            model: config.model,
            prompt: prompt,
            extra_body: {
                response_format: "url"
            },
        };
        if (images.length > 0) data.extra_body["image"] = [...images];

        console.warn("QQ -> AI: ", JSON.stringify(data, null, 4));

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

        // console.warn("res:\n" + (JSON.stringify(res, (key, value) => {
        //     if (key === 'request' || key === 'config' || key === 'headers') return undefined;
        //     if (typeof value === 'bigint') return value.toString();
        //     return value;
        // }, 4)));

        reply([
            msgbuilder.reply(pack.real_id),
            msgbuilder.at(pack.user_id),
            msgbuilder.text(" 画完啦～"),
            msgbuilder.img(res.data.data[0].url)
        ]);
    } catch (err) {
        reply([
            msgbuilder.reply(pack.real_id),
            msgbuilder.at(pack.user_id),
            msgbuilder.text(`画不出来，怎么样都画不出来！>n<\n\n>> ${err}`),
        ]);
    }
})