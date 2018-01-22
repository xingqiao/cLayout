var fs = require("fs");
var path = require("path");
var os = require("os");
var child_process = require("child_process");
var ejs = require("ejs");
var electron = require("electron");
var app = electron.app;  // 控制应用生命周期的模块。
var BrowserWindow = electron.BrowserWindow;  // 创建原生浏览器窗口的模块
var ipcMain = electron.ipcMain;

// 保持一个对于 window 对象的全局引用，不然，当 JavaScript 被 GC，
// window 会被自动地关闭
var mainWindow = null;

// 当所有窗口被关闭了，退出。
app.on("window-all-closed", function () {
    // 在 OS X 上，通常用户在明确地按下 Cmd + Q 之前
    // 应用会保持活动状态
    if (process.platform != "darwin") {
        app.quit();
    }
});

// 当 Electron 完成了初始化并且准备创建浏览器窗口的时候
// 这个方法就被调用
app.on("ready", function () {
    // 创建浏览器窗口。
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 1000,
        webPreferences: {
            // nodeIntegration: false   // 在渲染进程中禁用Nodejs环境
        }
    });

    // 加载应用的 index.html
    mainWindow.loadURL("file://" + __dirname + "/layout.html");

    // 打开开发工具
    // mainWindow.openDevTools();

    // 当 window 被关闭，这个事件会被发出
    mainWindow.on("closed", function () {
        // 取消引用 window 对象，如果你的应用支持多窗口的话，
        // 通常会把多个 window 对象存放在一个数组里面，
        // 但这次不是。
        mainWindow = null;
    });
});


;(function(ns){
    if (!global[ns]) {
        global[ns] = {};
    }
    let utils = global[ns];
    let exec = child_process.exec;

    utils.is_win = /win/i.test(os.platform());

// 类型判断
    Array.prototype.forEach.call(["Object", "Function", "String", "Number", "Boolean", "Date", "Undefined", "Null", "Array", "File", "RegExp"], function(t, i) {
        utils["is" + t] = function(obj) {
            return Object.prototype.toString.call(obj) === "[object " + t + "]";
        };
    });
    utils.isTrueEmpty = function(obj) {
        return obj === undefined || obj === null || obj === "" || (utils.isNumber(obj) && isNaN(obj));
    };
    utils.isEmpty = function(obj) {
        if (utils.isTrueEmpty(obj)) {
            return true;
        } else if (utils.isObject(obj)) {
            for (var key in obj) {
                return !key && !0;
            }
            return true;
        } else if (utils.isArray(obj)) {
            return obj.length === 0;
        } else if (utils.isString(obj)) {
            return obj.length === 0;
        } else if (utils.isNumber(obj)) {
            return obj === 0;
        } else if (utils.isBoolean(obj)) {
            return !obj;
        }
        return false;
    };

// 执行系统命令

    /**
     * 执行系统命令
     * @param {String} str 要执行的命令
     * @param {Object} opt 调用参数
     * @param {Function} cb 回调函数
     */
    utils.execCmd = (cmd, opt, cb) => {
        if (utils.isFunction(opt)) {
            cb = opt;
            opt = null;
        } else if (!utils.isFunction(cb)) {
            cb = null;
        }
        if (opt) {
            // 参数
            if (utils.isArray(opt.argv)) {
                opt.argv.forEach((item) => {
                    var v = item == null ? "" : "" + item;
                    v = v.replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/!/g, "\"\\!\"");
                    cmd += " \"" + v + "\"";
                });
            }

            // 日志文件
            if (opt.logfile) {
                cmd += " >> " + ("" + opt.logfile).replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\s/g, "_") + " &"
            }

            // ssh执行
            if (opt.ssh && opt.ssh.ip) {
                if ("pwd" in opt.ssh && opt.ssh.pwd) {
                    utils.execCmd("cd " + g_config.path.shell + ";./" + g_config.shell.ssh, {argv: [opt.ssh.ip, opt.ssh.user || "user_00", opt.ssh.pwd, cmd], log: opt.log || ""}, cb);
                } else {
                    utils.execCmd("cd " + g_config.path.shell + ";./" + g_config.shell.get_pwd + " " + opt.ssh.ip, function(err, stdout) {
                        utils.execCmd("cd " + g_config.path.shell + ";./" + g_config.shell.ssh, {argv: [opt.ssh.ip, opt.ssh.user, stdout, cmd], log: opt.log || ""}, cb);
                    });
                }
                return;
            }
        }

        console.log("执行命令：" + cmd);
        var timeStart = new Date();
        exec(cmd, {
            encoding: "utf8",
            timeout: 0,
            maxBuffer: 10 * 1024 * 1024, // 默认 200 * 1024 bytes
            killSignal: "SIGTERM"
        }, cb);
    };

// 文件操作

    /**
     * 复制文件
     * @param {String} source 源文件路径
     * @param {String} target 目标文件路径
     * @param {Function} callback 回调函数
     * @param {Boolean} override 是否覆盖，默认为是
     * @param {String} type 复制类型，值为"mv"时为“移动文件”
     */
    utils.cp = (source, target, callback, override = 1, type = "cp") => {
        fs.stat(target, (error, data) => {
            if (error || override) {
                let dirpath = path.dirname(target);
                utils.mkdirs(dirpath, () => {
                    let cmd = utils.is_win ? "copy /Y" : "cp -f";
                    if (type == "mv") {
                        cmd = utils.is_win ? "move /Y" : "mv -f";
                    }
                    utils.execCmd(cmd, {argv: [source, target], no_log: 1}, callback);
                });
            } else if (utils.isFunction(callback)) {
                callback();
            }
        });
    };

    /**
     * 移动文件
     * @param {String} source 源文件路径
     * @param {String} target 目标文件路径
     * @param {Function} callback 回调函数
     */
    utils.mv = (source, target, callback, override = 1) => {
        utils.cp(source, target, callback, override, "mv");
    };

    /**
     * 删除文件
     * @param {String} filepath 文件路径
     * @param {Function} callback 回调函数
     */
    utils.rm = (filepath, callback) => {
        utils.execCmd((utils.is_win ? "del /Q /F " : "rm -f ") + filepath, callback);
    };

    /**
     * 删除文件夹
     * @param {String} dirpath 文件路径
     * @param {Function} callback 回调函数
     */
    utils.rmdir = (dirpath, callback) => {
        utils.execCmd((utils.is_win ? "rmdir /Q /S " : "rm -f -r ") + dirpath, callback);
    };

    /**
     * 按照路径创建文件夹
     * @param {String} dirpath 文件路径
     * @param {Function} callback 回调函数
     */
    utils.mkdirs = (dirpath, callback) => {
        callback = callback || function(){};
        fs.exists(dirpath, function(exist) {
            if (!exist) {
                var mkdir = "mkdir -p";
                dirpath = ("" + dirpath).replace(/[\\\/]+/g, path.sep)
                if (utils.is_win) {
                    mkdir = "md";
                    if (/^[\\\/]/.test(dirpath)) {
                        mkdir = "cd / && " + mkdir;
                        dirpath = ("" + dirpath).replace(/^[\\\/]+/, "");
                    }
                }
                utils.execCmd(mkdir, {argv: [dirpath], no_log: 1}, callback);
            } else {
                callback();
            }
        });
    };

    /**
     * 以异步的方式读取文件
     * @param {String} filepath 文件路径
     * @param {Function} callback 回调函数
     */
    utils.readFile = (filepath, callback) => {
        if (filepath && utils.isFunction(callback)) {
            try {
                fs.readFile("" + filepath, function(error, data){
                    callback(error, "" + data);
                });
            } catch(ex){
                callback(ex);
            }
        }
    };

    /**
     * 以异步的方式写文件，会自动创建目录
     * @param {String} filepath 文件路径
     * @param {String} filedata 文件内容
     * @param {Object} [options] 参数设置
     * @param {Function} callback 回调函数
     */
    utils.writeFile = (filepath, filedata, options, callback) => {
        let dirpath = path.dirname(filepath);
        utils.mkdirs(dirpath, () => {
            if (utils.isFunction(options)) {
                callback = options;options = null;
            }
            fs.writeFile(filepath, filedata, options, callback);
        });
    };

// 流程控制

    /**
     * 串行流程控制，类似async.js
     * @param {Array} tasks 要执行的函数数组
     * @param {Function} callback 回调函数
     */
    utils.series = (tasks, callback) => {
        if (utils.isFunction(tasks)) {
            tasks = [tasks];
        } else if (!tasks) {
            tasks = [];
        }
        if (!utils.isFunction(callback)) {
            callback = null;
        }
        var results = [],
            flags = [];
        function iterator(index) {
            if (index < tasks.length) {
                var task = tasks[index];
                if (utils.isFunction(task)) {
                    task.call({index: index, count: tasks.length}, function(err, result){
                        if (!flags[index]) {
                            flags[index] = 1; // 标记已执行
                            if (err) {
                                callback && callback(err, results);
                            } else {
                                results[index] = result;
                                iterator(index + 1);
                            }
                        }
                    });
                } else {
                    results[index] = task;
                    iterator(index + 1);
                }
            } else {
                callback && callback(null, results);
            }
        };
        iterator(0);
    };

    /**
     * 串行流程控制，类似async.js
     * @param {Array} arr 要遍历的数组
     * @param {Function} iterator 执行的操作
     * @param {Function} callback 回调函数
     */
    utils.mapSeries = (arr, iterator, callback) => {
        if (utils.isFunction(arr)) {
            arr = [arr];
        } else if (!arr) {
            arr = [];
        }
        if (!utils.isFunction(callback)) {
            callback = null;
        }
        if (!utils.isFunction(iterator)) {
            return callback && callback();
        }
        var results = [],
            flags = [];
        function _iterator(index) {
            if (index < arr.length) {
                iterator.call({index: index, count: arr.length}, arr[index], function(err, result){
                    if (!flags[index]) {
                        flags[index] = 1; // 标记已执行
                        if (err) {
                            callback && callback(err, results);
                        } else {
                            results[index] = result;
                            _iterator(index + 1);
                        }
                    }
                });
            } else {
                callback && callback(null, results);
            }
        };
        _iterator(0);
    };

// 其他

    /**
     * 过滤
     */
    utils.filter = (obj, where, context) => {
        var results = [], match;
        if (obj == null) {
            return results;
        }
        if (utils.isFunction(where)) {
            match = where;
        } else {
            match = function(o) {
                for (var q in where) {
                    if (o[q] != where[q]) {
                        return false;
                    }
                };
                return true;
            };
        }
        for (var p in obj) {
            if (!where || match.call(context, obj[p], p, obj)) {
                results.push(obj[p]);
            }
        };
        return results;
    };

    /**
     * 渲染模板
     * @param {String} template ejs模板
     * @param {Object} data 数据
     * @param {Function} callback 回调函数 (error, html)
     * @return {Promise}
     */
    utils.render = (template, data, callback) => {
        fs.stat(template, (error) => {
            if (error) {
                callback(error);
            } else {
                ejs.renderFile(template, data, callback);
            }
        });
    };

    return utils;
})("utils");

function saveImg(list, callback) {
    utils.rmdir(path.join(__dirname, "/result/image"), () => {
        utils.mapSeries(list, function (item, next) {
            var imgs = [];
            for (var key in item.data) {
                if (item.data.hasOwnProperty(key)) {
                    imgs.push({
                        key: key,
                        data: item.data[key]
                    })
                }
            }
            utils.mapSeries(imgs, function (img, _next) {
                var dataBuffer = new Buffer(img.data.replace(/^data:image\/\w+;base64,/, ""), 'base64');
                var url = "/image/" + item.index + (img.key === "src" ? "" : "@" + img.key) + ".jpg";
                item.data[img.key] = "." + url;
                utils.writeFile(path.join(__dirname, "/result" + url), dataBuffer, _next);
            }, next);
        }, callback);
    });
};

// 生成页面
ipcMain.on("export-result", function (event, data) {
    var template = path.join(__dirname, "/template.html");
    var result = path.join(__dirname, "/result/index.html");
    var reply = function(params) {
        event.sender.send("export-result-success", JSON.stringify(params));
    };
    try {
        data = JSON.parse(data);
        if (data.backgroundImage) {
            data.list.push(data.backgroundImage);
        }
        saveImg(data.list, function(error) {
            if (error) {
                console.log(error);
            }
            utils.render(template, {data: data}, function (error, html) {
                if (error) {
                    reply({code: -2, error: "" + error});
                } else {
                    utils.writeFile(result, html, function (error) {
                        reply({code: error ? -3 : 0, error: error ? "" + error : null, data: result});
                    });
                }
            });
        })
    } catch (error) {
        reply({code: -1, error: "" + error});
    }
});
