
var Page = {
    obj: {},
    setting: {
        engine: 1,
        type: 0, // 页面类型，0-h5页，1-PC页
        size: 640,
        scope: 10, // 容错值，解决因为压缩导致的颜色偏差
        unitSize: 0, // 精细度，默认为宽度的四十分之一
        limit: 900, // 切片高度，超过这个值会进行分割
        combine: 1, // 是否开启小图片合并
        quality: 0.7, // 图像质量
        viewSize: 640
    },

    log: function(text) {
        if (!Page.logIndex) {
            Page.logIndex = 0;
        }
        console.log.apply(console, arguments);
        if (!Page.$log || !Page.$log.length) {
            Page.$log = $(".js_console");
        }
        if (Page.$log.length) {
            Page.$log.show().append($("<div>").text("[" + Page.logIndex + "] " + Array.prototype.join.call(arguments, " "))).scrollTop(Page.$log[0].scrollHeight);
            Page.logIndex++;
        }
    },

    // 切换导航显示
    nav: function(cur, target) {
        index = cur ? Math.abs(cur) : 0;

        // 切换导航
        $(".js_nav .current")
            .not($(".js_nav dd:eq(" + index + ")").addClass("current"))
            .removeClass("current");

        // 标记按钮
        $(".js_next").attr("data-target", target || (index + 1));

        // 菜单切换
        var $curMenu = $(".js_menu[data-nav=" + index + "]").show();
        $(".js_menu").not($curMenu).hide();

        // 其他初始化操作
        if (index == 0) {
            $(".js_set").hide();
            $(".js_panel").empty();
            $(".js_set").hide();
            delete Page.obj.$workbench;
            $(".js_selectfile").fadeIn(500);
        } else if (index == 1) {
            $(".js_set").fadeIn();
        }
    },

    createImgFigure: function(opts) {
        return $("<figure>")
            .addClass("panel-img " + (opts.className || ""))
            .append($("<figcaption>").text(opts.title || ""))
            .append($("<div>").addClass("content").append(opts.content));
    },

    formatTitle: function(filename, originalWidth, originalHeight, width){
        var zoom = Math.round(1000 * width / originalWidth) / 10;
        return "[" + originalWidth  + " ⨯ " + originalHeight + (zoom != 1 ? " @ " + zoom + "%" : "") + "] " + filename;
    },

    // 加载图片到canvas
    loadImgToCanvas: function() {
        var width = this.setting.size,
            viewSize = this.setting.viewSize;

        // PC页不进行缩放
        if (this.setting.type == 1) {
            width = null;
        }

        // 加载图片到canvas
        var c = CL.loadImgToCanvas(this.obj.img, {width: width, viewWidth: viewSize, backgroundColor: "#fff"});
        var o = {
            width: c.width,
            height: c.height,
            img: this.obj.img,
            canvas: {
                img: c.canvas
            }
        };

        $.extend(this.obj, c, o);
        this.obj.canvas.cover = CL.createCanvas({width: c.width, height: c.height, viewWidth: viewSize, name: "cover"});
        if (this.obj.$workbench) {
            this.obj.$workbench.find("figcaption").html(this.formatTitle(this.setting.filename, c.originalWidth, c.originalHeight, c.width));
            this.obj.$workbench.find(".content").empty().append(this.obj.canvas.img, this.obj.canvas.cover);
        }
    },

    // 加载图片文件
    loadImgFile: function(file) {
        if (file) {
            CL.openImgFile(file, function(err, img){
                if (err) {
                    return alert(err);
                } else if (img.width < 320) {
                    return alert("所选择的图片太小，请选择宽度不小于320的图片")
                }

                // 隐藏水印
                $(".watermark").hide();

                // 图片信息
                Page.obj.img = img;
                var title = Page.formatTitle(file.name, img.width, img.height, Page.setting.size);
                Page.log("加载图片：" + title);
                Page.setting.filename = file.name;

                // 展示图片
                Page.loadImgToCanvas();
                var cWidth = $(".js_body").width();
                Page.obj.$workbench = Page.createImgFigure({
                        content: [Page.obj.canvas.img, Page.obj.canvas.cover],
                        wrap: "panel panel-img",
                        title: title
                    })
                    .css({"display": "none", "margin-left": (cWidth - Page.setting.viewSize - 16) / 2})
                    .appendTo(".js_panel")
                    .fadeIn()
                    .delay(500)
                    .animate({marginLeft: 0}, 500, function(){Page.nav(1)});

                Page.obj.$workbench.append($("<div>").addClass("console js_console").hide());
            });
        }
    },

    // 分析
    analyse: function() {
        var time = new Date();
        var time2 = time;
        console.time("analyse");
        CL.analyse(Page.obj.canvas.img, $.extend({
            onprogress: function() {
                console.log("[" + this.index + "/" + this.count + "]", new Date() - time, new Date() - time2);
                time2 = new Date();
            }
        }, Page.setting), function(error, data){
            console.timeEnd("analyse");
            var allTime = new Date() - time;
            console.log(data)
            if (data && data.list) {
                Page.result = data;
                // 绘制分割结果
                var $result = $(".js_result_body tbody").empty();
                var cover = Page.obj.canvas.cover;
                ctx = cover.getContext("2d");
                ctx.clearRect(0, 0, cover.width, cover.height);
                ctx.textBaseline = "top";
                ctx.font = "14px 黑体";
                var _append = function (index, item, position) {
                    var $tr = $("<tr>").html(
                        "<td>" + index + "</td>"
                        + "<td>" + item.width + "</td>"
                        + "<td>" + item.height + "</td>"
                        + "<td>" + position + "</td>"
                        + "<td><a><img></a></td>"
                    );
                    $tr.find("a").attr({target: "_blank", href: item.data.src});
                    $tr.find("img").attr("src", item.data.src);
                    $result.append($tr);
                };
                data.list.forEach(function(item, index) {
                    var position = [];
                    if (!item.list) {
                        ctx.fillStyle = "rgba(0, 0, 255, .4)";
                        ctx.fillRect(item.left, item.top, item.width, item.height);
                        ctx.strokeStyle = "rgba(255, 255, 255, .4)";
                        ctx.strokeRect(item.left, item.top, item.width, item.height);
                        ctx.fillStyle = "rgb(255, 255, 255)";
                        ctx.fillText(index + ": " + item.width + " * " + item.height, item.left + 5, item.top + 5);
                        position.push("[" + item.left + "," + item.top + "]");
                    } else {
                        item.list.forEach(function(sub, j) {
                            ctx.fillStyle = "rgba(0, 0, 255, .4)";
                            ctx.fillRect(sub.originalLeft, sub.originalTop, sub.width, sub.height);
                            ctx.strokeStyle = "rgba(255, 255, 255, .4)";
                            ctx.strokeRect(sub.originalLeft, sub.originalTop, sub.width, sub.height);
                            ctx.fillStyle = "rgb(255, 255, 255)";
                            ctx.fillText(index + "." + (j + 1) + ": " + sub.width + " * " + sub.height, sub.originalLeft + 5, sub.originalTop + 5);
                            position.push("[" + sub.originalLeft + "," + sub.originalTop + " @ " + sub.left + "," + sub.top + "]");
                        });
                    }
                    _append(index, item, position.join("<br>"));
                });
                if (data.backgroundImage) {
                    var position = [];
                    var bgtype = parseInt(data.opts && data.opts.bgtype || 0);
                    if (bgtype & 1) {
                        position.push("浮动");
                    }
                    if (bgtype & 2) {
                        position.push("平铺");
                    }
                    if (bgtype & 3) {
                        position.push("拉伸");
                    }
                    _append(index, data.backgroundImage, position.join("<br>"));
                }
                $(".js_result h3").empty().append("分割出图片数：" + data.list.length);
                $(".js_result h4").html("总耗时：" + allTime + "ms / 解析耗时：" + data.engineTime + "ms");
                $(".js_result").fadeIn();
            } else {
                alert(error || "解析图片失败");
            }
        });
    },

    // 初始化
    init: function() {
        if (!window.FileReader) {
            alert("当前浏览器不支持该页面，请升级到IE11，或更换Chrome浏览器。")
        } else {
            var _togglePanel = function () {
                var $curSet = $(".js_set .js_item[data-part=\"" + Page.setting.type + "\"]").show();
                $(".js_set .js_item[data-part]").not($curSet).hide();
            };

            $(document)
                // 选择文件
                .on("dragover dragleave dragend", function(e){return false})
                .on("drop", function(e){
                    Page.loadImgFile(e.originalEvent.dataTransfer.files[0]);
                    return false;
                })
                .on("click", ".js_selectfile", function() {
                    var $o = $("#photo-input");
                    if (!$o.length) {
                        $o = $('<input type="file" id="photo-input" style="display:none" accept="image/*">').change(function(){
                            Page.loadImgFile(this.files[0]);
                        }).appendTo("body");
                    };
                    $o.trigger("click");
                })

                // 设置
                .on("change", ".js_setting", function(e) {
                    var $o = $(this);
                    var name = $o.attr("data-name");
                    var value = this.value;

                    if (/^(?:range|number)$/.test(this.type)) {
                        value = +value;
                        var min = $o.attr("min");
                        if (!isNaN(min) && value < min) {
                            this.value = value = min;
                        }
                        var max = $o.attr("max");
                        if (!isNaN(max) && value > max) {
                            this.value = value = max;
                        }
                    } else if (this.type === "file") {
                        var file = this.files && this.files[0];
                        if (file) {
                            CL.openImgFile(file, function(err, img){
                                if (!err) {
                                    Page.setting[name] = img;
                                }
                            });
                        }
                    } else if (name === "bgtype") {
                        value = 0;
                        $('.js_setting[data-name="bgtype"]:checked').each(function () {
                            if (this.value > 0) {
                                value += parseInt(this.value);
                            }
                        })
                    }

                    Page.setting[name] = value;

                    if (value != null) {
                        if (name === "type") {
                            var $o = $o.parents(".js_menu");
                            _togglePanel();
                            if (Page.obj && Page.obj.img) {
                                Page.loadImgToCanvas();
                            }
                        } else if (name === "size") { // 更改页面宽度
                            Page.loadImgToCanvas();
                        }
                    }
                })
                .on("input", ".js_setting", function(e) {
                    if (/^(?:range|number)$/.test(this.type)) {
                        var $o = $(this);
                        var value = this.value;
                        $o.siblings("input").val(value);
                    }
                })

                .on("click", ".js_reload", function(e) {
                    location.reload();
                })
                .on("click", ".js_start", function(e) {
                    Page.analyse();
                })
                .on("click", ".js_result_close", function(e) {
                    $(".js_result").fadeOut();
                });

            $(".js_setting").each(function() {
                var name = this.getAttribute("data-name"),
                    value = this.value;
                if (value != null && (this.type != "radio" || this.checked)) {
                    Page.setting[name] = this.value;
                }
            });
            _togglePanel();

            // Electron环境，允许生成页面
            if (typeof require !== "undefined") {
                var ipcRenderer = require("electron").ipcRenderer;
                ipcRenderer.on("export-result-success", function(event, ret) {
                    console.log(ret);
                    try {
                        ret = JSON.parse(ret);
                        if (ret.code != 0) {
                            alert("导出失败：" + ret.error);
                        } else {
                            alert("导出成功：" + ret.data);
                        }
                    } catch (error) {
                        alert("导出失败：" + error);
                    }
                });
                $(document).on("click", ".js_result_export", function(e) {
                    ipcRenderer.send("export-result", JSON.stringify(Page.result));
                });
            } else {
                $(".js_result_export").remove();
            }

            Page.nav();
        }
    }
};

;(function(){
    Page.init();
    $(".js_global_setting").trigger("change");
})();
