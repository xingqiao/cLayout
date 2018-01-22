/**
 * 加载wasm
 * @param {String} path wasm 文件路径
 * @param {Object} imports 传递到 wasm 代码中的变量，值为 false 时只做预加载
 */
const loadWebAssembly = (function () {
    let map = {};
    // 创建 WebAssembly 实例
    const createInstance = (module, imports = {}) => {
        imports.env = imports.env || {}

        // 开辟内存空间
        imports.env.memoryBase = imports.env.memoryBase || 0
        if (!imports.env.memory) {
            imports.env.memory = new WebAssembly.Memory({ initial: 256 })
        }

        // 创建变量映射表
        imports.env.tableBase = imports.env.tableBase || 0
        if (!imports.env.table) {
            // 在 MVP 版本中 element 只能是 "anyfunc"
            imports.env.table = new WebAssembly.Table({ initial: 0, element: 'anyfunc' })
        }

        // 创建 WebAssembly 实例
        return new WebAssembly.Instance(module, imports);
    };
    // 加载，由于Electron相对路径文件使用的是file协议，fetch不支持file协议链接，所以改用XMLHttpRequest加载
    const load = url => {
        if (location.protocol === "file:" && !/^data:/.test(url)) {
            return new Promise(function(resolve, reject) {
                let xhr = new XMLHttpRequest();
                xhr.onreadystatechange = function() {
                    if (xhr.readyState == 4) {
                        if (xhr.status == 200) {
                            try {
                                let reader = new FileReader();
                                reader.onload = () => resolve(reader.result);
                                reader.onerror = e => reject(e);
                                reader.readAsArrayBuffer(xhr.response);
                            } catch (e) {
                                reject(e);
                            }
                        } else {
                            reject(new Error(xhr.statusText));
                        }
                    }
                };
                xhr.responseType = "blob";
                xhr.open('GET', url, true);
                xhr.send();
            });
        } else {
            return fetch(url).then(response => response.arrayBuffer());
        }
    };
    return (url, imports) => {
        if (!map[url]) {
            return load(url)
                .then(buffer => WebAssembly.compile(buffer))
                .then(module => {
                    map[url] = module;
                    if (imports !== false) {
                        return createInstance(map[url], imports);
                    }
                });
        } else if (imports !== false) {
            return new Promise(function (resolve, reject) {
                resolve(createInstance(map[url], imports));
            });
        }
    }
})();