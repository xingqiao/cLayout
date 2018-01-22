/*! clayout v0.1 | 智能切图工具 | ctchen */

/* 调用示例
    CL.analyse(img, {配置参数}, function(error, data){
        // 返回的data数据结构
        data = {
            // 页面类型
            "type": 0, // 0-H5 1-PC

            // 页面大小
            "width": 640,
            "height": 2645,

            // 页面背景色
            "backgroundColor": "#f3e3f7",

            // PC页背景图
            "backgroundImage": {
                "width": 960,
                "height": 960,
                "index": "bg",
                "data": {
                    "src": "data:image/jpeg;base64,/9j/4AAQS……H7q6I//9k="
                }
            },

            // 分割出来的图片元素
            "list": [

                // 独立图片元素
                {
                    "top": 2376,
                    "bottom": 2543,
                    "left": 48,
                    "right": 591,
                    "width": 544,
                    "height": 168,
                    "index": 11,

                    // 图像数据，根据分辨率会可能会生成 320、640、原始大小 三种
                    "data": {
                        "320": "data:image/jpeg;base64,/9j/4AAQS……3M7N9z/9k=",
                        "src": "data:image/jpeg;base64,/9j/4AAQS……H7q6I//9k="
                    }
                },

                // 雪碧图类型
                {
                    "width": 512,
                    "height": 48,

                    // 雪碧图中每个子图像元素定位
                    "list": [
                        {
                            "left": 8,
                            "top": 8,
                            "originalLeft": 240,
                            "originalTop": 2584,
                            "width": 160,
                            "height": 32
                        },
                        {
                            "left": 176,
                            "top": 8,
                            "originalLeft": 160,
                            "originalTop": 1032,
                            "width": 328,
                            "height": 24
                        }
                    ],
                    "backgroundColor": "#f3e3f7",
                    "index": 12,
                    "data": {
                        "320": "data:image/jpeg;base64,/9j/4AAQS……AP/Z",
                        "src": "data:image/jpeg;base64,/9j/4AAQS……D/2Q=="
                    }
                }
            ]
        }
    });
*/

var global = this;

; (function (window, factory) {

    "use strict";

    if (typeof module === "object" && typeof module.exports === "object") {
        module.exports = factory(window);
    } else {
        window.CL = factory(window);
    }

})(typeof window !== "undefined" ? window : global, function (window) {

    "use strict";

    // 串行控制流
    var series = function (async, tasks, callback) {
        if (typeof async === "function" || async instanceof Array) {
            callback = tasks;
            tasks = async;
            async = false;
        }
        if (typeof tasks === "function") {
            tasks = [tasks];
        } else if (!tasks) {
            tasks = [];
        }
        if (typeof callback != "function") {
            callback = null;
        }
        var pos = -1, data;
        function iterator() {
            pos++;
            if (pos < tasks.length) {
                var task = tasks[pos];
                if (typeof task === "function") {
                    task.call({ index: pos + 1, count: tasks.length }, data, function (error, lastdata) {
                        if (error) {
                            callback && callback(error, data);
                        } else {
                            data = lastdata;
                            if (async) {
                                setTimeout(iterator, 0);
                            } else {
                                iterator();
                            }
                        }
                    });
                } else {
                    iterator();
                }
            } else {
                callback && callback(null, data);
            }
        };
        iterator();
    };
    // 并行控制流
    var parallel = function (tasks, callback) {
        if (Object.prototype.toString.call(tasks) !== "[object Array]") {
            tasks = [tasks];
        }
        if (typeof callback !== "function") {
            callback = null;
        }
        var results = [], // 保存任务结果
            flags = (1 << tasks.length) - 1, // 标记任务状态
            n = flags;
        var _done = function (error, data, i) {
            if (callback) {
                if (error) {
                    flags = 0;
                } else {
                    results[i] = data;
                    flags &= (n - (1 << i));
                }
                if (!flags) {
                    callback(error, results);
                    callback = null;
                }
            }
        };
        tasks.forEach(function (item, i) {
            if (typeof item === "function") {
                item(function (error, data) {
                    _done(error, data, i);
                });
            } else {
                _done(null, item, i);
            }
        })
    };

    // 预加载 wasm
    var wasmUrl = "./analyse.wasm";
    if (window.WebAssembly) {
        loadWebAssembly(wasmUrl, false);
    }

    // worker辅助
    var CW = (function () {
        var worker,
            href,
            index = 0,
            tasks = {},
            method = {};

        // 初始化worker
        var initWorker = function () {
            if (worker && worker.url != href) {
                worker = null;
            }
            if (!worker && href && typeof Worker !== "undefined") {
                try {
                    worker = new Worker(href);
                    worker.onmessage = worker.onerror = function (e) {
                        // console.log(e)

                        if (e.type == "message") {
                            var item = tasks[e.data && e.data.id];
                            if (item && item.callback) {
                                item.callback(e.data.error, e.data.result);
                            }
                        } else {
                            // 一旦出错就禁用掉worker，并执行所有未完成的任务
                            worker = href = null;
                            for (var no in tasks) {
                                var item = tasks[no];
                                if (item && item.action && method[item.action]) {
                                    method[item.action](item.opts, item.callback);
                                }
                                delete tasks[no];
                            }
                        }
                    };
                    worker.url = href;
                } catch (error) {
                    console.log(error);
                    worker = href = null;
                }
            }
            return worker;
        };

        // Worker环境处理
        if (!global.window) {
            global.onmessage = function (e) {
                if (e.data.action && method[e.data.action]) {
                    method[e.data.action](e.data.opts, function (error, data) {
                        postMessage({
                            id: e.data.id,
                            error: error,
                            result: data
                        });
                    });
                } else {
                    postMessage(e.data.opts);
                }
            };
        }

        return {
            init: function (opts) {
                if (opts) {
                    href = opts.workerJs;
                }
                return this;
            },
            on: function (action, func) {
                method[action] = func;
            },
            trigger: function (action, opts, callback) {
                if (method[action]) {
                    // 先尝试用Worker执行，不支持或出错的话再同步执行
                    initWorker();
                    if (href && worker) {
                        try {
                            tasks[index] = {
                                action: action,
                                opts: opts,
                                callback: callback
                            };
                            worker.postMessage({ id: index, action: action, opts: opts });
                            index++;
                        } catch (error) {
                            console.log(error);
                        }
                    } else {
                        method[action](opts, callback);
                    }
                }
            }
        }
    })();

    // CW.init({workerJs: "./clayout.js"});

    // 图片分析（WebAssembly）
    CW.on("c_analyse", function (opts, callback) {
        var imageData = opts.imageData,
            pixes = imageData.data,
            table = [],
            list = [],
            map = {},
            backgroundColor,
            width = opts.width, // 页面宽度
            ww = width * 4,
            height = opts.height || parseInt(pixes.length / ww), // 页面高度
            scope = opts.scope > 0 ? opts.scope : 10, // 容错值，解决因为压缩导致的颜色偏差
            limit = opts.limit >= 100 ? opts.limit : null, // 图片分片高度，值大于100时才有效
            size = opts.size >= 1 ? parseInt(opts.size) : 8, // 识别精度
            s1 = size * ww,
            s2 = size * 4;

        var WA = {};
        var memData;
        var logNo = 0;

        loadWebAssembly(wasmUrl, {
            env: {
                jsLog: function (msg) {
                    console.log("[log][%d] %d", ++logNo, msg)
                },
                // 计算背景色
                getBgcolor: function (pos, size) {
                    var h = size / width;
                    let map = {};
                    for (let index = pos, count = pos + size; index < count; index += 4) {
                        if (memData[index + 3] == 2) {// 纯色单元格
                            let color = (((memData[index] << 8) + memData[index + 1]) << 8) + memData[index + 2];
                            map[color] = map[color] > 0 ? map[color] + 1 : 1;
                        }
                    }
                    let max = 0;
                    let bg = 0;
                    for (const color in map) {
                        if (map[color] > max) {
                            max = map[color];
                            bg = color;
                        }
                    }
                    return bg;
                }
            }
        }).then(instance => {
            WA = instance.exports;

            let startTime = Date.now();

            let MEM_BLOCK = 65535;
            let memory = WA.memory;
            let memSize = memory.buffer.byteLength;
            if (memSize < pixes.length) {
                memSize = Math.ceil(pixes.length * 2 / MEM_BLOCK) * MEM_BLOCK;
                memory.grow(Math.ceil((memSize - memory.buffer.byteLength) / MEM_BLOCK));
            }
            memData = new Uint8Array(memory.buffer);

            // 存放图像数据
            memData.set(pixes, 0);

            // 解析
            var ptr = WA.analyse(0, width, height, size, limit, scope);

            // 提取解析结果
            // [0, 3) 背景色 R G B
            // [3, 7) 裁剪结果数量
            // [7, 7 + 24n) 裁剪结果列表 left top right bottom width height
            var data = {
                scope: scope,
                size: size,
                limit: limit,
                backgroundColor: (0x1000000 + (memData[ptr] << 16) + (memData[ptr + 1] << 8) + memData[ptr + 2]).toString(16).replace(/^1/, "#"),
                list: []
            };
            ptr += 3;
            var getInt = pos => (memData[pos] << 24) + (memData[pos + 1] << 16) + (memData[pos + 2] << 8) + memData[pos + 3];
            var count = getInt(ptr);
            ptr += 4;
            for (let index = 0; index < count; index++) {
                data.list.push({
                    left: getInt(ptr),
                    top: getInt(ptr + 4),
                    right: getInt(ptr + 8),
                    bottom: getInt(ptr + 12),
                    width: getInt(ptr + 16),
                    height: getInt(ptr + 20)
                });
                ptr += 24;
            }

            data.time = Date.now() - startTime;

            callback && callback(null, data);
        });
    });

    // 图片分析（js）
    CW.on("js_analyse", function (opts, callback) {
        let startTime = Date.now();

        var imageData = opts.imageData,
            pixes = imageData.data,
            table = [],
            list = [],
            map = {},
            backgroundColor,
            width = opts.width, // 页面宽度
            ww = width * 4,
            height = opts.height || parseInt(pixes.length / ww), // 页面高度
            scope = opts.scope > 0 ? opts.scope : 10, // 容错值，解决因为压缩导致的颜色偏差
            limit = opts.limit >= 100 ? opts.limit : null, // 图片分片高度，值大于100时才有效
            size = opts.size >= 1 ? parseInt(opts.size) : 8, // 识别精度
            s1 = size * ww,
            s2 = size * 4;

        // 分割图像，先检测空行，进行水平分割，再检查分割出来区域中的空列，进行垂直分割
        var js_splitImg = function (opts) {
            var _list = [],
                leftIndex = opts.left,
                topIndex = opts.top,
                rightIndex = opts.right,
                bottomIndex = opts.bottom,
                top = -1,
                left = -1,
                right = -1,
                bottom = -1;

            // 水平分割
            for (var rowIndex = topIndex; rowIndex <= bottomIndex; rowIndex++) {
                var row = table[rowIndex];

                // 找出空行
                var rowEmpty = 1;
                if (CL.isArray(row)) {
                    for (var colIndex = leftIndex; colIndex <= rightIndex; colIndex++) {
                        var item = row[colIndex];

                        // 过滤掉只有背景色的单元
                        if (item && (!item.color || ((Math.abs(item.color[0] - backgroundColor[0]) > scope) || (Math.abs(item.color[1] - backgroundColor[1]) > scope) || (Math.abs(item.color[2] - backgroundColor[2]) > scope)))) {
                            rowEmpty = 0;
                            delete item.color;
                            left = colIndex < left || left == -1 ? colIndex : left;
                            right = colIndex > right ? colIndex : right;
                        } else {
                            delete row[colIndex];
                        }
                    }
                }

                // 发现空行或匹配到最后一行时，对之前匹配到的区域进行垂直分割
                if (rowEmpty || rowIndex === bottomIndex) {
                    if (rowEmpty) {
                        // 全图匹配时，如果检测到空行，就将其从索引表中移除
                        if (opts.all) {
                            delete table[rowIndex];
                        }
                    } else {
                        bottom = rowIndex;
                    }

                    if (top >= 0) { // 记录被分割的区域
                        // 找出空列
                        var colEmpty,
                            _top = bottom,
                            _bottom = top,
                            _right,
                            _left = left;

                        // 垂直分割
                        for (var colIndex = left; colIndex <= right; colIndex++) {
                            colEmpty = 1;
                            for (var n = top; n <= bottom; n++) {
                                if (table[n] && table[n][colIndex]) {
                                    if (n < _top) {
                                        _top = n;
                                    }
                                    if (n > _bottom) {
                                        _bottom = n;
                                    }
                                    colEmpty = 0;
                                }
                            }

                            // 发现空列或已经匹配到最后一列时，判断是否有可以切割的图片，有的话将其添加到队列中
                            if (colEmpty || colIndex === right) {
                                _right = colEmpty ? colIndex - 1 : right;
                                if (_bottom >= _top && _right >= _left) {
                                    // 如果匹配到的区域还存在继续分割的可能，就采用递归的方式继续进行匹配
                                    if (_top != topIndex || _bottom != bottomIndex || _left != leftIndex || _right != rightIndex) {
                                        _list = _list.concat(js_splitImg({
                                            left: _left,
                                            top: _top,
                                            right: _right,
                                            bottom: _bottom
                                        }));;
                                    } else {
                                        _list.push({
                                            left: _left,
                                            top: _top,
                                            right: _right,
                                            bottom: _bottom
                                        });
                                    }

                                    // 恢复指针，开始下一轮匹配
                                    _top = bottom;
                                    _bottom = top;
                                }

                                // m是第一个空列，_left指针移动到下一列
                                _left = colIndex + 1;
                            }
                        }

                        top = left = right = bottom = -1;
                    }
                } else {
                    top = rowIndex < top || top == -1 ? rowIndex : top;
                    bottom = rowIndex > bottom ? rowIndex : bottom;
                }
            }

            return _list;
        };

        console.time("计算索引");
        // 计算索引（纯色方格）
        for (var y = 0, p1 = 0, iy = 0; y < height; y += size, p1 += s1, iy++) {
            for (var x = 0, p2 = p1, ix = 0; x < width; x += size, p2 += s2, ix++) {
                var color = null,
                    size_w = size > width - x ? width - x : size,
                    size_h = size > height - y ? height - y : size;

                // 统计方格内颜色值的和
                for (var i = 0, p3 = p2; i < size_h; i++ , p3 += ww) {
                    for (var j = 0, p4 = p3; j < size_w; j++ , p4 += 4) {
                        var r = pixes[p4],
                            g = pixes[p4 + 1],
                            b = pixes[p4 + 2];
                        if (!color) {
                            color = [r, g, b];
                        } else if ((Math.abs(color[0] - r) > scope) || (Math.abs(color[1] - g) > scope) || (Math.abs(color[2] - b) > scope)) { // 颜色不一致
                            color = null;
                            i = size_h;
                            j = size_w;
                        }
                    }
                }

                // 记录索引
                if (!table[iy]) {
                    table[iy] = [];
                }
                table[iy][ix] = {};

                if (color) {
                    table[iy][ix].color = color;
                    color = color.join("_");
                    if (map[color]) {
                        map[color]++;
                    } else {
                        map[color] = 1;
                    }
                }
            }
        }
        console.timeEnd("计算索引");

        console.time("判断背景色");
        // 判断背景色
        var count = 1;
        for (var color in map) {
            if (map[color] > count) {
                count = map[color];
                backgroundColor = color;
            }
        }
        map = count = null;
        console.timeEnd("判断背景色");

        // 分割图片
        console.time("分割图片");
        if (backgroundColor) {
            backgroundColor = backgroundColor.split("_").map(function (n) { return parseInt(n) });
            list = js_splitImg({
                all: 1, // 标记当前是全图匹配
                top: 0,
                bottom: Math.ceil(height / size) - 1,
                left: 0,
                right: Math.ceil(width / size) - 1
            });
            backgroundColor = (0x1000000 + (backgroundColor[0] << 16) + (backgroundColor[1] << 8) + backgroundColor[2]).toString(16).replace(/^1/, "#");
        }
        console.timeEnd("分割图片");

        // 转换坐标
        console.time("转换坐标");
        list.forEach(function (item) {
            for (var key in item) {
                if (item[key] > 0) {
                    item[key] *= size;
                }
            }
            item.right = Math.min(width - 1, item.right + size - 1);
            item.bottom = Math.min(height - 1, item.bottom + size - 1);
            item.width = item.right - item.left + 1;
            item.height = item.bottom - item.top + 1;
        });
        console.timeEnd("转换坐标");

        // 分片裁剪
        console.time("分片裁剪");
        if (limit) {
            var _list = [];
            list.forEach(function (item) {
                if (item.height > limit) {
                    var count = Math.ceil(item.height / limit),
                        _height = Math.ceil(item.height / count / 15) * 15; // 避免出现半像素导致的横线，2 * 2.5 * 3
                    for (var index = 0; index < count; index++) {
                        _list.push({
                            top: item.top,
                            bottom: item.top + _height - 1,
                            left: item.left,
                            right: item.right,
                            width: item.width,
                            height: index === count - 1 ? (item.bottom - item.top + 1) : _height // 最后一个有可能高度不等于 _height
                        });
                        item.top += _height
                    }
                } else {
                    _list.push(item);
                }
            });
            list = _list;
        }
        console.timeEnd("分片裁剪");

        var data = {
            scope: scope,
            size: size,
            limit: limit,
            backgroundColor: backgroundColor,
            list: list
        };

        data.time = Date.now() - startTime;

        callback && callback(null, data);
    });


    var setting = {
        async: false, // 异步模式
        workerJs: null, // worker线程js
        random: false, // 随机展现列表中的词语，为true时越靠前的词语优先级越高
        orientation: false,	// 根据meta信息调整图片方向
        minWidth: 150,
        minHeight: 150,
        fontFamily: ["黑体"], // 字体
        minFontSize: 12, // 基本填充大小
        fontZoom: 10,	// 最大填充倍数
        fontColor: "#000000",	// 文字颜色
        square: false,	// 拉伸填充图案
        useOnes: false,	// 填充元素只使用一次
        backgroundColor: "#ffffff",	// 背景色
        shadowColor: "#000000",	// 原图阴影颜色
        onerror: null
    };

    var ERR = {
        "PARAM_INVALID": "参数错误",
        "READ_FILE_ERROR": "读取文件失败",
        "ANALYSE_IMG_ERROR": "解析图片失败"
    };

    var CL = {
        setting: setting
    };

    window.URL || (window.URL = window.webkitURL);

    // 类型判断
    Array.prototype.forEach.call(["Object", "Function", "String", "Number", "Boolean", "Date", "Undefined", "Null", "Array", "File", "RegExp", "FormData"], function (t, i) {
        CL["is" + t] = function (obj) {
            return Object.prototype.toString.call(obj) === "[object " + t + "]";
        };
    });
    CL.isTrueEmpty = function (obj) {
        return obj === undefined || obj === null || obj === "" || (CL.isNumber(obj) && isNaN(obj));
    };
    CL.isEmpty = function (obj) {
        if (CL.isTrueEmpty(obj)) {
            return true;
        } else if (CL.isObject(obj)) {
            for (var key in obj) {
                return !key && !0;
            }
            return true;
        } else if (CL.isArray(obj)) {
            return obj.length === 0;
        } else if (CL.isString(obj)) {
            return obj.length === 0;
        } else if (CL.isNumber(obj)) {
            return obj === 0;
        } else if (CL.isBoolean(obj)) {
            return !obj;
        }
        return false;
    };

    // 获取文件的 ObjectURL
    CL.getFileUrl = function (file, callback) {
        // 先采用 URL 的方式读取，不支持 URL 时采用 FileReader
        if (CL.isFunction(callback)) {
            if (CL.isFile(file)) {
                var url;
                if (window.URL) {
                    try {
                        url = window.URL.createObjectURL(file);
                    } catch (error) {
                        console.log(error);
                    }
                }
                if (url) {
                    callback(null, url);
                } else {
                    try {
                        var reader = new FileReader();
                        reader.onload = reader.onerror = function (e) {
                            callback(e.type == "error" ? ERR.READ_FILE_ERROR : null, this.result);
                        };
                        reader.readAsDataURL(file);
                    } catch (error) {
                        callback(error);
                    }
                }
            } else {
                callback(ERR.PARAM_INVALID);
            }
        }

        return CL;
    };

    // 加载图像链接
    CL.openImgUrl = function (imgurl, callback) {
        // 解析图片方向时必须使用Filereader的方式解析
        if (imgurl) {
            var img = new Image();
            img.onload = img.onerror = function (e) {
                callback && callback(e.type == "error" ? "error" : null, this);
            };
            img.src = imgurl;
        }

        return CL;
    };

    // 解析图片文件
    CL.openImgFile = function (file, callback) {
        if (CL.isFunction(callback)) {
            if (CL.isFile(file) && /image/.test(file.type)) {
                CL.getFileUrl(file, function (error, url) {
                    if (error) {
                        callback(error);
                    } else {
                        CL.openImgUrl(url, callback);
                    }
                });
            } else {
                callback(ERR.PARAM_INVALID);
            }
        }

        return CL;
    };

    // 加载图片到canvas
    CL.loadImgToCanvas = function (img, opts) {
        if (!opts) {
            opts = {};
        }
        var width = opts.width;
        var height = opts.height;
        if (width == null && height == null) {
            width = img.width;
            height = img.height;
        } else if (width == null) {
            width = parseInt(height * img.width / img.height);
        } else if (height == null) {
            height = parseInt(width * img.height / img.width);
        }

        if (width < setting.minWidth) {
            height = parseInt(setting.minWidth * height / width);
            width = setting.minWidth;
        }
        if (height < setting.minHeight) {
            width = parseInt(setting.minHeight * width / height);
            height = setting.minHeight;
        }

        var canvas;
        if (opts.canvas) {
            canvas = opts.canvas;
        } else {
            canvas = CL.createCanvas(width, height, opts.viewWidth, opts.viewHeight);
        }

        var ctx = canvas.getContext("2d"),
            x = 0, y = 0,
            sw = width,
            sh = height;
        if (sw != img.width || sh != img.height) {
            if (opts.type == "contain") { // contain模式
                sw = width / img.width;
                sh = height / img.height;
                if (sw > sh) {
                    sw = sh * img.width;
                    sh = height;
                    x = (width - sw) / 2;
                } else {
                    sh = sw * img.height;
                    sw = width;
                    y = (height - sh) / 2;
                }
            } else { // cover模式
                canvas.height = sh = height = parseInt(sw * img.height / img.width);
            }
        }
        if (opts.backgroundColor) {
            ctx.fillStyle = opts.backgroundColor;	// 背景色
            ctx.fillRect(0, 0, width, height);
        }
        ctx.drawImage(img, x, y, sw, sh);

        return {
            canvas: canvas,
            width: width,
            height: height,
            originalWidth: img.width,
            originalHeight: img.height
        };
    };

    // 创建画布
    CL.createCanvas = function (width, height, viewWidth, viewHeight, name) {
        var backgroundColor;
        if (typeof width == "object" && width && width.width) {
            backgroundColor = width.backgroundColor;
            name = width.name;
            viewWidth = width.viewWidth;
            viewHeight = width.viewHeight;
            height = width.height;
            width = width.width;
        }
        var canvas = document.createElement("canvas");
        if (width > 0) {
            canvas.width = width;
            if (!(height > 0)) {
                height = width;
            }
        }
        if (height > 0) {
            canvas.height = height;
        }
        if (viewWidth) {
            canvas.style.width = viewWidth + (viewWidth > 0 ? "px" : "");
        }
        if (viewHeight) {
            canvas.style.height = viewHeight + (viewHeight > 0 ? "px" : "");
        }
        if (name) {
            canvas.setAttribute("data-name", name);
        }
        if (backgroundColor) {
            var ctx = canvas.getContext("2d");
            ctx.fillStyle = backgroundColor;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        return canvas;
    };

    // 分析
    /**
     * @param {Image|Canvas} img 图片
     * @param {Object} opts
     * @param {Number} opts.engine 使用的解析引擎：0-js，1-WebAssembly
     * @param {Number} opts.type 页面类型，0-h5页，1-PC页，PC页不进行缩放
     * @param {Number} opts.scope 容错值，解决因为压缩导致的颜色偏差
     * @param {Number} opts.unitSize 精细度，默认为宽度的四十分之一
     * @param {Number} opts.limit 切片高度，超过这个值会进行分割，值小于0时不进行切片
     * @param {Number} opts.quality 保存的图像质量，默认为0.7
     * @param {Boolean} opts.combine 是否开启小图片合并
     * @param {String} opts.bgcolor PC页背景色
     * @param {Image|Canvas} opts.bgimg PC页背景图
     * @param {Number} opts.bgtype PC页背景图加载方式，二进制位表示，从右往左分别是： 保持在窗口顶部 | 在垂直方向上重复 | 水平方向拉伸
     * @param {Function} callback 回掉函数
     */
    CL.analyse = function (img, opts, callback) {
        //////////////////////////////
        console.log(opts);
        if (CL.isFunction(opts)) {
            callback = opts;
            opts = {};
        } else if (!CL.isObject(opts)) {
            opts = {};
        }
        if (CL.isFunction(callback)) {
            var tagName = img && img.tagName;
            if (tagName === "IMG") {
                img = this.loadImgToCanvas(img).canvas;
            } else if (tagName !== "CANVAS") {
                return callback(ERR.PARAM_INVALID);
            }
            analyse(img, opts, callback);
        }
    };
    function analyse(canvas, opts, callback) {
        var ctx = canvas.getContext("2d"),
            width = canvas.width,
            height = canvas.height,
            sourceData = ctx.getImageData(0, 0, width, height),
            onprogress = opts.onprogress,
            type = opts.type, // 页面类型，0-h5页，1-PC页，PC页不进行缩放
            unitSize = opts.unitSize || parseInt(width / 40), // 精细度，默认为宽度的四十分之一
            scope = opts.scope, // 容错值，解决因为压缩导致的颜色偏差
            limit = opts.limit, // 切片高度，超过这个值会进行分割
            combine = opts.combine == 1, // 是否开启小图片合并
            engine = opts.engine, // 使用的解析引擎：0-js，1-WebAssembly
            quality = opts.quality >= 0.5 && opts.quality <= 1 ? opts.quality : 0.7, // 保存的图像质量，默认为0.7
            backgroundColor, // 背景色
            list = []; // 解析结果

        var bgimg; // PC背景图
        var engineTime; // 解析引擎耗时

        series(setting.async, [
            // 图像解析
            function (data, next) {
                var _series = this;
                var engineType = engine == 1 ? "c_analyse" : "js_analyse";
                console.time(engineType);
                CW.trigger(engineType, {
                    imageData: sourceData,
                    width: canvas.width,
                    height: canvas.height,
                    size: unitSize,
                    scope: scope,
                    limit: limit
                }, function (error, data) {
                    console.timeEnd(engineType);
                    if (!error && data && data.list) {
                        backgroundColor = data.backgroundColor;
                        unitSize = data.size;
                        list = data.list;
                        engineTime = data.time;
                    } else {
                        error && console.log(error);
                        error = ERR.ANALYSE_IMG_ERROR;
                    }
                    onprogress && onprogress.call(_series);
                    next(error);
                });
            },
            // 提取图像数据
            function (data, next) {
                var _series = this;
                list.forEach(function (item, index) {
                    item.canvas = CL.createCanvas(item);
                    var ctx = item.canvas.getContext("2d");
                    ctx.drawImage(canvas, item.left, item.top, item.width, item.height, 0, 0, item.width, item.height);
                });
                onprogress && onprogress.call(_series);
                next();
            },
            // 合并小图片
            function (data, next) {
                var _series = this;
                if (combine) {
                    var _list = [],
                        small = [];
                    list.forEach(function (item, i) {
                        if (item.width * item.height < 360000) {
                            small.push(item);
                        } else {
                            _list.push(item);
                        }
                    });

                    if (small.length > 1) {
                        // 将小图片弄成雪碧图的形式
                        // 先按高度排序，然后从左往有进行布局，宽度取 width 值
                        small = small.sort(function (a, b) {
                            return b.height != a.height ? b.height - a.height : b.width - a.width;
                        });
                        var _width, _height, _left, _top, temp;
                        var _add = function (item, left, top) {
                            item && temp && temp.list.push({
                                left: left,
                                top: top,
                                originalLeft: item.left,
                                originalTop: item.top,
                                width: item.width,
                                height: item.height,
                                canvas: item.canvas
                            });
                        };
                        for (var index = 0; index < small.length; index++) {
                            if (!temp) {
                                temp = {
                                    width: 0,
                                    height: 0,
                                    list: []
                                };
                            }

                            // 先将第一个放入队列
                            var item = small[index];
                            _left = unitSize;
                            _top = temp.height + unitSize;
                            _width = item.width + unitSize;
                            _height = item.height + unitSize;
                            _add(item, _left, _top);

                            // 水平方向上放置图片
                            while (small[index + 1] && _width <= width) {
                                var __width = 0,
                                    __height = 0;
                                _left = _width + unitSize;

                                // 如果高度没有超过第一个，就在竖直方向上放置
                                while (small[index + 1] && __height + small[index + 1].height <= _height) {
                                    index++;
                                    item = small[index];
                                    _add(item, _left, _top + __height);
                                    __width = Math.max(__width, item.width);

                                    var ___width = item.width + unitSize,
                                        ___height = item.height + unitSize;

                                    // 看下水平方向上能否再放下
                                    while (small[index + 1] && ___width + small[index + 1].width + unitSize <= __width) {
                                        index++;
                                        item = small[index];
                                        _add(item, _left + ___width, _top + __height);
                                        ___width += item.width + unitSize;
                                    }
                                    __height += ___height;
                                }
                                if (__width) {
                                    _width += __width + unitSize;
                                } else {
                                    break;
                                }
                            }

                            // 判断是另起一行还是用一张新图继续
                            temp.width = Math.max(temp.width, _width) + unitSize;
                            temp.height += _height + unitSize;
                            if (temp.height > width || !small[index + 1]) {
                                temp.backgroundColor = backgroundColor;
                                temp.canvas = CL.createCanvas(temp);
                                var ctx = temp.canvas.getContext("2d");
                                temp.list.forEach(function (item) {
                                    ctx.drawImage(item.canvas, item.left, item.top);
                                    delete item.canvas;
                                });
                                _list.push(temp);
                                temp = null;
                            }
                        }
                        list = _list;
                    }
                }
                onprogress && onprogress.call(_series);
                next();
            },
            // 编号
            function (data, next) {
                var _series = this;
                list.forEach(function (item, index) {
                    item.index = index;
                    item.data = {};
                });
                onprogress && onprogress.call(_series);
                next();
            },
            // 缩放
            function (data, next) {
                var _series = this;
                if (type != 1) {
                    var canvas = CL.createCanvas();
                    var ctx = canvas.getContext("2d");
                    for (var i = 1; i < 4; i++) {
                        var w = i * 320,
                            s = w / width;
                        if (width > w) {
                            list.forEach(function (item) {
                                canvas.width = parseInt(item.width * s);
                                canvas.height = parseInt(item.height * s);
                                ctx.drawImage(item.canvas, 0, 0, canvas.width, canvas.height);
                                item.data[w] = canvas.toDataURL("image/jpeg", quality);
                            });
                        } else {
                            break;
                        }
                    }
                }
                onprogress && onprogress.call(_series);
                next();
            },
            // 生成base64数据
            function (data, next) {
                var _series = this;
                list.forEach(function (item, index) {
                    item.data.src = item.canvas.toDataURL("image/jpeg", quality);
                    delete item.canvas;
                });
                // PC页背景图
                if (type == 1 && opts.bgimg) {
                    bgimg = opts.bgimg;
                    if (bgimg.tagName === "IMG") {
                        bgimg = CL.loadImgToCanvas(bgimg).canvas;
                    }
                    if (bgimg.tagName === "CANVAS") {
                        bgimg = {
                            index: "bg",
                            width: bgimg.width,
                            height: bgimg.height,
                            data: {
                                src: bgimg.toDataURL("image/jpeg", quality)
                            }
                        };
                    } else {
                        bgimg = null;
                    }
                }
                onprogress && onprogress.call(_series);
                next();
            }
        ], function (error) {
            let data = {
                opts: opts,
                type: type,
                width: width,
                height: height,
                backgroundImage: bgimg,
                backgroundColor: backgroundColor,
                list: list,
                engineTime: engineTime
            };
            callback(error, data);
        }, true);
    }

    return CL;
});