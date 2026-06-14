let is_reload = false;
const config = {
    // 转发聊天的群聊
    QQChat: 759676433,
    Admin: new Set([
        1669044502,
        3827764490,
        ...spark.env.get("admin_qq") ?? []
    ]),

    MC2QQ: {
        Chat: true, // 聊天
        Join: true, // 加入
        Left: true, // 退出
        Say: true // 广播
    },

    QQ2MC: {
        Chat: { // 聊天
            enable: true, // 是否启用
            export: (userName, msg) => { // 对其他聊天插件兼容
                if (ll.hasExported("BDSLM", "addMsg"))
                    ll.imports("BDSLM", "addMsg")({
                        type: 'chat',
                        source: "QQ",
                        realName: `§eQQ群§7|§6${userName}§a`,
                        msg: msg
                    });
            }
        },
        Cmd: { // 运行命令
            enable: true, // 是否启用
            player: [ // 普通用户可以执行的指令
                "/list",
                "/help"
            ]
        }
    },

    // 敏感词过滤
    WordFilter: {
        enable: true, // 是否启用
        mode: 1, // 调用模式 (1: 内置的, 2: API)
        use: { // 启用过滤的功能
            QQ: true, // 消息发送至QQ群时过滤
            MC: true // 消息发送至MC时过滤
        },

        // 内置的过滤系统
        // 内置的系统过滤可能比较简单
        Internal: {
            word: ["操你", "傻逼", "死", "fuck"], // 敏感词列表
            replaceChar: "喵" // 替换敏感词的字符，比如：fuck -> 喵喵喵喵
        },

        // API模式
        // 调用解析
        // 使用此功能可接入其更强大的敏感词过滤插件
        // 输入玩家发送的原始信息，返回过滤后的信息
        // >> 需要LSE-js基础，如果你不知道此项该如何使用请不要使用此项！
        API: (msg) => {
            return ll.imports('WordFilter', 'filter')(msg);
        }

    }
}



// === MC2QQ === //
// Chat - 聊天
if (config.MC2QQ.Chat)
    mc.listen("onChat", (pl, msg) => {
        if (msg[0] === "+") return;

        if (config.WordFilter.enable
            && config.WordFilter.use.MC
        ) msg = WFilter(msg); 

        spark.QClient.sendGroupMsg(config.QQChat, `[${{ 0: "主世界", 1: "下界", 2: "末地" }[pl.pos.dimid] || "未知"}]`
            + `${pl.getDevice()?.avgPing > 100 ? `[${pl.getDevice().avgPing}ms]` : ""}`
            + `${pl.realName} >> ${msg}`
        );
    });

// Join - 加入
if (config.MC2QQ.Join)
    mc.listen("onJoin", (pl) => {
        if (!is_reload)
            spark.QClient.sendGroupMsg(config.QQChat, `${pl.realName} 进入服务器`)
    });

// Left - 退出
if (config.MC2QQ.Left)
    mc.listen("onLeft", (pl) => {
        if (!is_reload)
        spark.QClient.sendGroupMsg(config.QQChat, `${pl.realName} 退出服务器`)
    });


// Say - 广播
if (config.MC2QQ.Say)
    mc.listen("onConsoleCmd", (cmd) => {
        if (cmd.startsWith("say "))
            spark.QClient.sendGroupMsg(config.QQChat, `[服务器娘] ${cmd.slice(4)}`)
    });

ll.exports((msg) => spark.QClient.sendGroupMsg(config.QQChat, `${WFilter(msg)}`), "QQChatEx", "onSendChat");
mc.listen("onConsoleCmd", (cmd) => {
    if (cmd === "ll reload sparkbridge3") is_reload = true;
})


// === QQ2MC === //
spark.on('message.group.normal', async (pack, reply) => {
    if (pack.group_id !== config.QQChat
        || pack.message.length === 0
    ) return;

    const userName = pack.sender.card || pack.sender.nickname;
    const msg = (await formatMsg(pack.message, pack)).replace(/\n/g, "\\n");

    // Cmd - 运行命令
    if (config.QQ2MC.Cmd
        && msg.startsWith("/")
        && (config.Admin.has(pack.user_id - 0)
            || config.QQ2MC.Cmd.player.some(cmd => msg.startsWith(cmd))
        )
    ) {
        const res = mc.runcmdEx(msg)?.output ?? false;
        if (res === false) return;
        reply(res);
        logger.setTitle("QQCommand");
        logger.info(`${userName} >> ${msg}\n>> ${res}\n`);
        logger.setTitle("Server");
        return;
    }

    // Chat - 聊天
    if (config.QQ2MC.Chat) {
        let chatMsg = msg;
        const replyId = (pack.message.find(t => t.type === 'reply'))?.data?.id ?? null;

        if (config.WordFilter.enable
            && config.WordFilter.use.QQ
        ) chatMsg = WFilter(msg); 

        if (replyId !== null) {
            const reply = await spark.QClient.getMsg(replyId);
            const msgData = (await formatMsg(reply.message, reply)).match(/\[([^\]]+)\](?:\[[^\]]+\])?([^>]+)>>\s*(.+)/);
            if (msgData && msgData[2]) chatMsg = `@${msgData[2]} §6回复 "${msgData[3].slice(0, 5)}..."§r： ${chatMsg}`;
        }

        config.QQ2MC.Chat.export(userName, msg);
        mc.broadcast(`[§6QQ群§r]${userName}§r >> ${chatMsg}`);
        logger.setTitle("QQBot");
        logger.info(`${userName} >> ${chatMsg}`);
        logger.setTitle("Server");
    }
})

const sensitive_regex = new RegExp(config.WordFilter.Internal.word.join("|"), "gi");
function WFilter(msg) {
    if (config.WordFilter.mode === 1) {
        msg = msg.replace(sensitive_regex, (match) => {
            return config.WordFilter.replaceChar.repeat(match.length);
        });
    } else msg = config.WordFilter.API(msg);
    return msg;
}

async function formatMsg(msg, pack) {
    const results = await Promise.all(msg.map(async (t) => {
        switch (t.type) {
            case 'text': return t.data.text;
            case 'image': return "[图片]";
            case 'face': return "[表情]";
            case 'at': {
                const info = await spark.QClient.getGroupMemberInfo(pack.group_id, t.data.qq)
                return `@${info.card || info.nickname || `${t.data.qq}`}`;
            }
            default: return "";
        }
    }));
    return results.join("");
}
