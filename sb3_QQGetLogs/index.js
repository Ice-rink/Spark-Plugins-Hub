const fs = require('fs');
const path = require('path');

// === 配置相关 === //
const configFile = spark.getFileHelper('QQGetLog');
configFile.initFile("config.json", {
    group: [spark.env.get("main_group")],
    group_all: true,
    cmd: "/getlog",
    logFile: "G:\\Server\\logs\\BehaviorLog",
    pageSize: 10
})

// 网页配置
const config = JSON.parse(configFile.read("config.json"));
spark.web.createConfig("QQGetLogs")
    .array("group", config.group, "允许的群组")
    .switch("group_all", config.group_all, "允许所有群组")
    .text("cmd", config.cmd, "触发指令")
    .text("logFile", config.logFile, "日志目录")
    .number("pageSize", config.pageSize, "单页最多允许数")
    .register();

spark.on("config.update.QQGetLogs", (key, val) => {
    if (key === "group") val = val.map(Number);
    config[key] = val;
    configFile.write('config.json', config);
});

function extractDate(filename) {
    const match = filename.match(/BehaviorLog-(\d{4})-(\d{2})-(\d{2})\.csv$/);
    if (match) {
        return new Date(match[1], match[2] - 1, match[3]);
    }
    return null;
}

function getFileList() {
    if (!fs.existsSync(config.logFile)) {
        logger.error(`目录不存在: ${config.logFile}`);
        return [];
    }
    
    const files = fs.readdirSync(config.logFile);
    const logFiles = files.filter(file => file.endsWith('.csv') && file.includes('BehaviorLog'));
    
    const fileList = logFiles
        .map(file => {
            const fullPath = path.join(config.logFile, file);
            const stats = fs.statSync(fullPath);
            const date = extractDate(file);
            return { 
                name: file, 
                size: stats.size,
                date: date,
                dateStr: date ? date.toISOString().slice(0, 10) : '未知'
            };
        })
        .sort((a, b) => {
            if (!a.date && !b.date) return 0;
            if (!a.date) return 1;
            if (!b.date) return -1;
            return b.date - a.date;
        });
    
    return fileList;
}

function getPageData(fileList, page) {
    const start = (page - 1) * config.pageSize;
    const end = start + config.pageSize;
    const totalPages = Math.ceil(fileList.length / config.pageSize);
    
    return {
        items: fileList.slice(start, end),
        currentPage: page,
        totalPages: totalPages,
        total: fileList.length,
        hasPrev: page > 1,
        hasNext: page < totalPages
    };
}

// 将文件转换为 base64
function fileToBase64(filePath) {
    const content = fs.readFileSync(filePath);
    return content.toString('base64');
}

spark.on('message.group.normal', async (pack, reply) => {
    const textMsg = toTextMsg(pack.message)?.split(" ") || [];
    
    if (!((config.group_all || config.group.includes(pack.group_id))
        && pack.message.length !== 0
        && textMsg[0] === config.cmd
    )) return;

    const fileList = getFileList();

    // list 命令
    if (textMsg[1] === "list") {
        if (fileList.length === 0) {
            reply("没有找到任何日志文件");
            return;
        }
        
        let page = parseInt(textMsg[2]) || 1;
        const pageData = getPageData(fileList, page);
        
        if (page < 1 || page > pageData.totalPages) {
            reply(`页码无效，请输入 1-${pageData.totalPages} 之间的数字`);
            return;
        }
        
        const fileListStr = pageData.items.map((file, idx) => {
            const num = (page - 1) * config.pageSize + idx + 1;
            return `[${num}] ${file.name} - (${formatFileSize(file.size)})`;
        }).join('\n');
        
        let navInfo = `第 ${pageData.currentPage}/${pageData.totalPages} 页 | 共 ${pageData.total} 个文件\n`;
        if (pageData.hasPrev) navInfo += `📖 上一页: ${config.cmd} list ${page - 1}\n`;
        if (pageData.hasNext) navInfo += `📖 下一页: ${config.cmd} list ${page + 1}\n`;
        
        reply(`📁 日志文件列表：\n${fileListStr}\n\n${navInfo}\n> 使用 ${config.cmd} <数字> 获取文件`);
        return;
    }
    
    // 获取指定序号的日志文件
    const fileIndex = parseInt(textMsg[1]) - 1;
    if (!isNaN(fileIndex) && fileList[fileIndex]) {
        const targetFile = fileList[fileIndex];
        const filePath = path.join(config.logFile, targetFile.name);
        
        // 发送准备提示
        await reply(`📤 正在准备发送: ${targetFile.name} (${formatFileSize(targetFile.size)})，请稍候...`);
        
        try {
            // 转换为 base64
            const base64 = fileToBase64(filePath);
            
            // 上传群文件（直接使用 spark.QClient）
            await spark.QClient.uploadGroupFile(
                pack.group_id,
                `base64://${base64}`,
                targetFile.name,
                ''  // 空字符串表示上传到根目录
            );
            
            logger.info(`已发送文件: ${targetFile.name}`);
            
        } catch (error) {
            logger.error(`发送文件失败: ${error.message}`);
            await reply(`❌ 发送失败: ${error.message}`);
        }
        return;
    }
    
    // 帮助信息
    if (textMsg[1] && isNaN(parseInt(textMsg[1]))) {
        reply(`❌ 无效参数\n用法：\n${config.cmd} list [页码] - 查看列表\n${config.cmd} <数字> - 获取文件`);
    } else if (textMsg[1] && !fileList[parseInt(textMsg[1]) - 1]) {
        reply(`❌ 序号无效，请输入 1-${fileList.length}`);
    } else {
        reply(`用法：\n${config.cmd} list [页码] - 查看列表\n${config.cmd} <数字> - 获取文件`);
    }
});

function toTextMsg(msg) {
    return msg.map(t => t.type === 'text' ? t.data.text : "").join("");
}

function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}