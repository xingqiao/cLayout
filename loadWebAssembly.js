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
    return (path, imports) => {
        if (!map[path]) {
            return fetch(path)
                .then(response => response.arrayBuffer())
                .then(buffer => WebAssembly.compile(buffer))
                .then(module => {
                    map[path] = module;
                    if (imports !== false) {
                        return createInstance(map[path], imports);
                    }
                });
        } else if (imports !== false) {
            return new Promise(function (resolve, reject) {
                resolve(createInstance(map[path], imports));
            });
        }
    }
})();