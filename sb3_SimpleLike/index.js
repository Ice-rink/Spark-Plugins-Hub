const likeQQ = new Set();

// === 配置相关 === //
const configFile = spark.getFileHelper('SimpleLike');
configFile.initFile("config.json", {
    group: [spark.env.get("main_group")],
    group_all: true,
    cmd: "赞我",
    num: 20
})

// 网页配置
const config = JSON.parse(configFile.read("config.json"));
spark.web.createConfig("SimpleLike")
    .array("group", config.group, "允许的群组")
    .switch("group_all", config.group_all, "允许所有群组")
    .text("cmd", config.cmd, "触发指令")
    .number("num", config.num, "点赞次数 (1-50)")
    .register();

spark.on("config.update.SimpleLike", (key, val) => {
    if (key === "group") val = val.map(Number);
    config[key] = val;
    configFile.write('config.json', config);
});

// send msg
spark.on('message.group.normal', (pack, reply) => {
    if (!((config.group_all 
        || config.group.includes(pack.group_id)) 
        && pack.raw_message == config.cmd
    )) return;
    spark.QClient.sendLike(pack.sender.user_id, config.num);
    // if (!likeQQ.has(pack.group_id)) { reply("赞我"); likeQQ.add(pack.group_id) };
    reply(`点赞完成! 你收获了 ${config.num} 个赞!`);
})