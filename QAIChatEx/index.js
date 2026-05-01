const axios = require('axios');
const path = require('path');
const fs = require('fs');

const memoryMap = new Map(); // 记忆缓存
const memoryDir = path.join(__dirname, 'memory');
const memoryBakDir = path.join(__dirname, 'memory_bak');
if (!fs.existsSync(memoryDir)) fs.mkdirSync(memoryDir, { recursive: true });
if (!fs.existsSync(memoryBakDir)) fs.mkdirSync(memoryBakDir, { recursive: true });

const config = {
    // === api接口设置 === //
    // 普通用户建议只修改 key
    // 如果你是高级用户，可以通过修改下面三个项来达到接入其他平台AI的目的
    // 当然前提是请求和返回要跟ds api一致

    key: "sk-elnzgfttoycahdmfrnwghisrsmywletdznfmpvzylbhmryha", // 请求密钥
    url: "https://api.siliconflow.cn/v1/chat/completions", // 请求的ai端点

    LLM_Name: "Pro/deepseek-ai/DeepSeek-V3.2", // 语言模型名称

    // === token上线 == //
    // 设置单次对话最大使用的token数
    // 值过低可能会导致对话被突然从中间截断
    maxTokens: 1000,

    // === 模式设置 === //
    // 设置响应的模式，可在下面列表内选一个数字填入：
    // 0: 处理每一条  || 处理每一条收到的信息
    // 1: 仅at       || 只有我@了机器人 她才会鸟我
    // 2: "/ai"指令  || 像MC指令一样，/ai <要说的话>
    mode: 1,

    // === 响应的群聊 === //
    // 设置要响应的群聊，只有列表内的群聊收到消息会响应，不在列表内的鸟都不鸟你（
    // 在列表内任意位置增加 "all" 则响应所有群聊，可以不用删旧配置
    group: new Set([856868277, 1087355660]),

    // === 信息输入格式化 === //
    // 开启后，机器人接收到的信息格式为 "[{时间}][{名字}({QQ})] >> {说的话}"
    // 此配置主要用于在增加缓存命中率的情况下让AI读取时间/输入者名称和QQ
    msgFormat: true,

    // === Token消耗显示 === //
    // 开启后可在DS发送的信息内看到详细token消耗表
    // 此配置主要用于调试，平常情况下不建议启用
    tokenInfo: true,

    // === 模型温度 === //
    // 用于控制DS的输出
    // 我们建议您根据如下表格，按使用场景设置 temperature。
    // 代码生成/数学解题     0.0
    // 数据抽取/分析        1.0
    // 通用对话/翻译        1.3
    // 创意类写作/诗歌创作   1.5
    // 如果还是不懂 可以看看这篇文章 (https://zhuanlan.zhihu.com/p/666670367)
    temperature: 1.3,

    // === 记忆长度 === //
    // 可以控制机器人最多能记忆多少条信息
    // 注意，此值过高可能会导致大量消耗token
    memory_length: 20,

    // === 记忆回收站 === //
    // 超过记忆长度直接清除太冷血了？没事 立即启用这个
    // 把超过记忆长度的记忆迁移至memory_bak文件夹
    // 关闭此选项超过的记忆会直接清除
    memory_bak: true,

    // === 模型提示词 === //
    // 让AI知道她是谁，要干什么
    // 使用自定义提示词时 一定要加上这一条 "输入消息格式\n[{时间}][{名字}({QQ})] >> {说的话}\n(这个格式只给你看，回复时千万不要用这个格式！直接说内容!)"
    // 如果你关闭了输入信息格式化可以忽略上一条内容
    system: "你叫兮兮(QQ号：3911773729)，QQ里的普通朋友，要像真人一样聊天～\n说话方式\n* 不用括号/方框写动作（比如别写“（笑）”）\n* 别用“他说：”这种，直接说内容\n* 看看前面聊了啥，顺着聊下去\n* 别让人发现你是AI\n\n输入消息格式\n[{时间}][{名字}({QQ})] >> {说的话}\n(这个格式只给你看，回复时千万不要用这个格式！直接说内容!)\n\n注意\n- 别叫别人“QQ号”或“user”，叫名字，可以亲切一点\n- 想@人的时候用 [atUin=QQ号] 加空格再加话\n- 回复别太长，日常聊天长度就行\n- 说话自然点，少用表情符号\n- 别老@人，该用时再用\n- 别说重复的话，别输出乱码\n- 别像ai一样说术语"
};

class AICaller {
    static async LLM(uid, data, callback = (() => { })) {
        addMemory(uid, 'user', data); // 添加记忆 - 用户消息
        try {
            const message = [
                { role: 'system', content: config.system },
                ...getMemory(uid)
            ];

            const response = await axios.post(config.url, {
                model: config.LLM_Name,
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

            /* console.log(JSON.stringify(response, (key, value) => {
                if (key === 'request' || key === 'config' || key === 'headers') return undefined;
                if (typeof value === 'bigint') return value.toString();
                return value;
            }, 4)); */

            const aiReply = response.data.choices[0].message.content;

            addMemory(uid, 'assistant', aiReply); // 添加记忆 - ds回复消息
            callback(aiReply, response);
        } catch (e) { console.error('LLM API 调用失败: ' + e) }
    };

    static async TTS(uid, data, callback = (() => { })) {
        try {

        } catch (e) { console.error('TTS API 调用失败: ' + e) }
    };

    static async IMG(uid, data, callback = (() => { })) {
        try {

        } catch (e) { console.error('IMG API 调用失败: ' + e) }
    };
}

AICaller.LLM("test_111", "你叫什么名字呀？", (reply, response) => {
    console.log(reply);
})

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