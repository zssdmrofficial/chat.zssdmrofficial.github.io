/**
 * pythonSandbox.js
 * 
 * 張師社會主義民主共和國 - 思想小助手專案
 * 獨立 Python 執行模組 (Code Interpreter)
 * 
 * 功能：
 * 1. 管理 Web Worker 內的 Pyodide 實例
 * 2. 執行 Python 程式碼
 * 3. 處理圖表與檔案輸出 (Base64)
 * 4. 提供與 Firestore 相容的資料結構
 */

const PYODIDE_WORKER_SCRIPT = `
importScripts("https://cdn.jsdelivr.net/pyodide/v0.23.4/full/pyodide.js");

let pyodideReadyPromise = null;
let pyodide = null;

// 初始化 Pyodide 與常用庫
async function loadPyodideAndPackages() {
    try {
        pyodide = await loadPyodide();
        // 載入完整的 Data Science Stack
        await pyodide.loadPackage(["micropip", "numpy", "pandas", "matplotlib", "scipy", "scikit-learn"]);
        
        // 設置 Python 環境輔助函數
        const setupCode = \`
import sys
import io
import os
import base64
import json
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import warnings
warnings.filterwarnings("ignore", message="Matplotlib is currently using agg")
import pandas as pd
import numpy as np

# 重導 stdout/stderr
class CatchOutput:
    def __init__(self):
        self.value = io.StringIO()
    def write(self, txt):
        self.value.write(txt)
    def flush(self):
        pass
    def get_value(self):
        return self.value.getvalue()

# 圖像捕捉
def get_plot_data():
    images = []
    if plt.get_fignums():
        for i in plt.get_fignums():
            plt.figure(i)
            buf = io.BytesIO()
            plt.savefig(buf, format='png', bbox_inches='tight')
            buf.seek(0)
            img_str = base64.b64encode(buf.read()).decode('utf-8')
            images.append({
                "type": "image/png",
                "data": img_str,
                "name": f"plot_{i}.png"
            })
        plt.close("all")
    return images

# 檔案系統管理 (讀取與清理)
def list_files():
    return set(os.listdir('.'))

# Variable Inspector: 偵測 DataFrame
def get_dataframes():
    dfs = {}
    # 掃描 global 變數
    # 注意: 我們在 exec() 中執行，變數可能在 locals() 或 globals()
    # 這裡我們主要檢查傳入的 context，但在 runPythonAsync 中，通常是 globals
    target_scope = globals()
    
    for name, val in target_scope.items():
        if name.startswith('_'): continue
        if isinstance(val, pd.DataFrame):
            try:
                # 限制回傳的大小以免爆掉
                preview = val.head(10).to_json(orient="split")
                dfs[name] = {
                    "type": "dataframe",
                    "rows": len(val),
                    "columns": list(val.columns),
                    "preview_json": preview
                }
            except:
                pass
    return dfs

_initial_files = list_files()
\`;
        await pyodide.runPythonAsync(setupCode);
        postMessage({ type: "READY" });
    } catch (err) {
        postMessage({ type: "ERROR", error: err.toString() });
    }
}

pyodideReadyPromise = loadPyodideAndPackages();

self.onmessage = async (event) => {
    await pyodideReadyPromise;
    const { id, code, convId } = event.data;

    if (event.data.type === "INIT") return;

    try {
        // 設定 stdout 捕捉
        await pyodide.runPythonAsync(\`
_stdout_capture = CatchOutput()
_stderr_capture = CatchOutput()
sys.stdout = _stdout_capture
sys.stderr = _stderr_capture
_pre_files = list_files()
\`);

        // 執行使用者的代碼
        let result = await pyodide.runPythonAsync(code);

        // 收集輸出與檔案
        const pythonPostProcess = \`
_post_files = list_files()
_new_files = _post_files - _pre_files - _initial_files
_file_results = []
_images = get_plot_data()
_vars = get_dataframes()

# 讀取新產生的檔案
for filename in _new_files:
    if os.path.isfile(filename):
        with open(filename, "rb") as f:
            content = f.read()
            b64 = base64.b64encode(content).decode('utf-8')
            mime = "text/plain" # Default
            if filename.endswith(".csv"): mime = "text/csv"
            elif filename.endswith(".json"): mime = "application/json"
            elif filename.endswith(".png"): mime = "image/png"
            elif filename.endswith(".jpg"): mime = "image/jpeg"
            
            _file_results.append({
                "name": filename,
                "type": mime,
                "data": b64
            })

try:
    _last_val = str(_)
except NameError:
    _last_val = ""

{
    "stdout": _stdout_capture.get_value(),
    "stderr": _stderr_capture.get_value(),
    "images": _images,
    "files": _file_results,
    "last_expr": _last_val,
    "variables": _vars
}
\`;
        
        // 取得處理後的資料 (PyProxy -> JS Object)
        let processedData = await pyodide.runPythonAsync(pythonPostProcess);
        let jsData = processedData.toJs({dict_converter: Object.fromEntries, list_converter: Array.from});
        
        // 如果 result 是 PyProxy，轉字串避免 Clone Error
        if (typeof result === 'object' && result !== null && result.toString) {
            result = result.toString();
        }

        postMessage({
            type: "SUCCESS",
            id,
            result: result, // 最後表達式的值
            stdout: jsData.stdout,
            stderr: jsData.stderr,
            images: jsData.images, // 陣列: {type, data, name}
            files: jsData.files,   // 陣列: {type, data, name}
            variables: jsData.variables // 物件: { varName: { type, rows, columns, preview_json } }
        });
        
        processedData.destroy();

    } catch (error) {
        postMessage({
            type: "EXEC_ERROR",
            id,
            error: error.message
        });
    }
};
`;

/**
 * PythonSandbox 類別
 * 提供主線程與 Web Worker 溝通的介面
 */
export class PythonSandbox {
    constructor() {
        this.worker = null;
        this.ready = false;
        this.pendingRequests = new Map();
        this.messageCounter = 0;

        // 使用 Blob 創建 Inline Worker，確保單檔獨立性
        const blob = new Blob([PYODIDE_WORKER_SCRIPT], { type: "text/javascript" });
        this.workerUrl = URL.createObjectURL(blob);
    }

    /**
     * 初始化 Sandbox
     * 啟動 Worker 並載入必要套件
     */
    async init() {
        if (this.ready) return;

        return new Promise((resolve, reject) => {
            this.worker = new Worker(this.workerUrl);

            this.worker.onmessage = (event) => {
                const { type, id, result, stdout, stderr, images, files, error } = event.data;

                if (type === "READY") {
                    this.ready = true;
                    resolve();
                } else if (type === "ERROR") {
                    console.error("Python Sandbox Init Error:", error);
                    reject(error);
                } else if (type === "SUCCESS" || type === "EXEC_ERROR") {
                    const resolver = this.pendingRequests.get(id);
                    if (resolver) {
                        if (type === "SUCCESS") {
                            resolver.resolve({
                                output: result,       // 表達式回傳值
                                logs: stdout + stderr, // 完整的文字輸出
                                images: images || [],
                                files: files || []
                            });
                        } else {
                            resolver.resolve({
                                error: error,
                                logs: error // Traceback 通常包含在 message 中
                            });
                        }
                        this.pendingRequests.delete(id);
                    }
                }
            };

            this.worker.postMessage({ type: "INIT" });
        });
    }

    /**
     * 執行 Python 程式碼
     * @param {string} code - Python 程式碼
     * @param {string} convId - 對話 ID (用於未來的隔離或 Context 管理)
     * @returns {Promise<object>} 結果物件 { logs, images, files, error }
     */
    async execute(code, convId) {
        if (!this.ready) {
            await this.init();
        }

        const id = ++this.messageCounter;

        return new Promise((resolve, reject) => {
            this.pendingRequests.set(id, { resolve, reject });
            this.worker.postMessage({ id, code, convId });
        });
    }

    /**
     * 終止 Worker
     */
    terminate() {
        if (this.worker) {
            this.worker.terminate();
            URL.revokeObjectURL(this.workerUrl);
            this.worker = null;
            this.ready = false;
            this.pendingRequests.clear();
        }
    }
}

// 實例化並導出單例模式，確保全站共享一個環境 (可選)
export const pythonSandbox = new PythonSandbox();
