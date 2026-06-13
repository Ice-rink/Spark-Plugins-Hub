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
            "- 回复别太长，日常聊天长度就行",
            "- 说话自然点，少用表情符号",
            "- 别老@人，该用时再用",
            "- 别说重复的话，别输出乱码",
            "- 别像ai一样说术语"
        ].join("\n")),

        tools: tools, // 工具调用
        knowledge: knowledge, // 搜索知识库数据
    },

    // === 响应设置 === //
    call: {
        // 群聊
        group: {
            enable: true, // 启用
            keywords: ["兮兮", "服务器"], // 关键词触发
            at: true, // 仅接收at
            all: false, // 接收所有消息
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
            split: /[。；\n]+/ // 分割的正则表达式
        }
    },

    // === 记忆设置 === //
    memory: {
        length: 50, // 记忆长度
        bak: true // 记忆清除时是否放入回收站
    }
};