const parseCQString = require('../../handles/parserCQString.js');
const path = require('path');
const fs = require('fs');

const config = {
    // 在哪个群聊里使用？
    // null为所有群聊
    QQChat: null, //759676433,

    // 支持触发调试指令的QQ号
    // 添加all则允许所有用户触发 || 慎用all功能 || 适用于单群多人协作
    AdminList: new Set([1669044502, 399844389])
};

ll.exports((f) => (fs.readFileSync(f).toString('base64')), "SparkAPIEx", "toBase64");

spark.on('message.group.normal', onMessage);
spark.on('message.private.friend', onMessage);

async function onMessage(pack, reply) {
    const textMsg = toTextMsg(pack.message);
    if (!((config.QQChat === null || pack?.group_id === config.QQChat)
        && config.AdminList.has(pack.user_id - 0)
        && pack.message.length !== 0
        && textMsg.startsWith("/debug")
    )) return;

    const replyId = (pack.message.find(t => t.type === 'reply'))?.data?.id ?? null;
    const parse = parseCmd(textMsg);

    if (parse.has("debugdata")) {
        reply(JSON.stringify(Object.fromEntries(parse), null, 4));
    };

    if (parse.has("reply") && replyId !== null) {
        reply(JSON.stringify((await spark.QClient.getMsg(replyId)), null, 4));
    };

    if (parse.has("msgdata")) {
        if (!parse.has("sendmsg")) reply(JSON.stringify(pack, null, 4));
    };

    if (parse.get("sendmsg") !== null) {
        let sendmsg = parse.get("sendmsg");
        if (parse.has("rawmsg")) reply(JSON.stringify(parseCQString.parse(sendmsg, null, 4)));
        if (parse.has("file2base64")) sendmsg = repFile2base64(sendmsg);
        reply(parseCQString.parse(sendmsg));
    };
}

function parseCmd(str) {
    const args = new Map();
    str.match(/--([^=\s]+)(?:="([^"]*)"|='([^']*)'|=(\S+))?/g)?.forEach(m => {
        const eq = m.indexOf('=');
        if (eq === -1) args.set(m.slice(2), null);
        else {
            let val = m.slice(eq + 1);
            if ((val[0] === '"' && val[val.length - 1] === '"') || (val[0] === "'" && val[val.length - 1] === "'")) val = val.slice(1, -1);
            args.set(m.slice(2, eq), val);
        }
    });
    return args;
}

function repFile2base64(str) {
    return str.replace(/\${([^}]+)}/g, (match, filePath) => {
        try {
            const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
            const buffer = fs.readFileSync(absolutePath);
            return buffer.toString('base64');
        } catch {
            return match;
        }
    });
};

function toTextMsg(msg) {
    return msg.map(t => {
        if (t.type === 'text') return t.data.text;
        return "";
    }).join("");
}