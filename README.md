# cLayout

一键生成重构稿

利用Canvas识别页面设计图中的背景色及独立图片元素，并自动生成静态重构稿

## 功能说明

选择设计稿上传，cLayout可以做到：

- 识别背景色

- 识别独立图片元素

- 生成静态重构稿（需要通过 Electron / nodejs 和 ejs 模版完成）

- 自适应，一次导出多种不同尺寸的图，生成的页面能自动选择合适大小的图

- 支持使用 WebAssembly 来提升识别性能

下载Electron封装的版本，解压后直接运行目录下的electron.exe，选择设计图按步骤操作就行

## 文件清单

- `clayout.js` 算法文件，负责页面设计图识别解析

- `loadWebAssembly.js` wasm模块加载器

- `analyse.cpp` 解析算法的c++实现

- `analyse.wasm` 编译后的wasm模块

- `template.html` 生成的页面模版，可以修改这个文件实现在生成的页面上增加公共模块（如页头、底栏）

- `clayout-electron.7z` electron封装，支持本地运行导出重构稿

## 调用方法

```javaScript
CL.analyse(img, {/* 配置参数 */}, function(error, data){
    // 返回的 data 数据结构
    data = {
        // 页面大小
        "width": 640,
        "height": 2645,
        // 页面背景色
        "backgroundColor": "#f3e3f7",
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
```