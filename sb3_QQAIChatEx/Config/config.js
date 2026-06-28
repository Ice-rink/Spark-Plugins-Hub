const knowledge = require("./knowledge.js");
const tools = require("./tools.js");

module.exports = {
    debug: false,

    // === AI设置 === //
    ai: {
        key: "sk-000000000000000000000000000000000000000000000000", // 请求密钥
        url: "https://apihub.agnes-ai.com/v1/chat/completions", // 请求的ai端点
        name: "agnes-2.0-flash", // 多模态模型名称
        maxTokens: 5000, // token上线
        temperature: 1.3, // 模型温度
        retry: 5, // 最多重试次数

        // 回退模型设置
        fallback: {
            key: "sk-00000000000000000000000000000000",
            url: "https://api.deepseek.com/chat/completions",
            name: "deepseek-v4-pro"
        },

        // 外置视觉模型配置
        // 如果你的主模型支持视觉也可以开
        lookai: {
            enable: true,
            key: "sk-000000000000000000000000000000000000000000000000",
            url: "https://apihub.agnes-ai.com/v1/chat/completions",
            name: "agnes-2.0-flash",
        },
        
        system: ([ // 系统提示词
            "你叫兮兮(QQ号 3911773729)，QQ里的普通朋友，要像真人一样聊天～",
            "",
            "## 说话方式",
            "- 回复别太长，日常聊天长度就行",
            "- 调用工具看看前面聊了啥，顺着聊下去",
            "- 如果你认为本次对话不需要回复，请返回'[false_chat]'",
            "- 回复会自动以换行/句号/分号分段发送",
            "- 如遇到不需要分割的内容（如代码、举例）请在开头与结尾用'```'包裹",
            "",
            "## 工具调用条件",
            "- 当该次对话时间与上次对话时间差异过大 或处于对话开头时，**必须**先获取最近聊天记录，了解上下文后再回复",
            "- 当需要服务器/开发者相关的知识时，首先搜索知识库，如知识库无法查询，再调用联网搜索",
            "",
            "## 输入消息格式：",
            "[{时间}][{名字}({QQ})] >> {说的话}",
            "(这个格式只给你看，回复时千万不要用这个格式！直接说内容!)",
            "",
            "## 注意",
            "- 说话自然点，少用表情符号",
            "- 别说重复的话，别输出乱码",
            "- 别用'他说：'这种，直接说内容",
            "- 应避免使用md格式，应当使用正常人类聊天格式",
            "- 别叫别人'QQ号'或'user'，叫名字，可以亲切一点",
        ].join("\n")),

        tools: tools, // 工具调用
        knowledge: knowledge, // 搜索知识库数据
    },

    // === 响应设置 === //
    call: {
        // 群聊
        group: {
            enable: true, // 启用
            keywords: ["兮兮"], // 关键词触发
            at: true, // 仅接收at
            all: false, // 接收所有消息
            data: new Set([ // 响应的群聊
                1087355660, // 测试群
                1029879634, // 1
                856868277, // 2
                464262043, // 4
                "all"
            ]),
            undata: new Set([ // 不响应的群聊
                759676433,
                642538983
            ])
        },

        // 私信
        private: {
            enable: true, // 启用
            data: new Set([ // 响应的私信
                1669044502,
                "all"
            ]),
            undata: new Set([]) // 不响应的私信
        }
    },

    // === 输入设置 === //
    input: {
        msgFormat: true, // 信息输入格式化
        chatList: 20, // 在输入中包含历史聊天记录的条数
        type: { // 消息输入类型
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
            codeBlock: true, // 启用代码块分割保护
            split: /[。；\n]+/ // 分割的正则表达式
        }
    },

    // === 记忆设置 === //
    memory: {
        length: 200, // 记忆长度
        bak: true // 记忆清除时是否放入回收站
    }
};