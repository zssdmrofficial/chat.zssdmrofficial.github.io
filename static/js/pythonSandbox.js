const PYODIDE_WORKER_SCRIPT = `
importScripts("https://cdn.jsdelivr.net/pyodide/v0.23.4/full/pyodide.js");

let pyodideReadyPromise = null;
let pyodide = null;

async function loadPyodideAndPackages() {
    try {
        pyodide = await loadPyodide();
        await pyodide.loadPackage(["micropip", "numpy", "pandas", "matplotlib", "scipy", "scikit-learn"]);
        
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

class CatchOutput:
    def __init__(self):
        self.value = io.StringIO()
    def write(self, txt):
        self.value.write(txt)
    def flush(self):
        pass
    def get_value(self):
        return self.value.getvalue()

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

def list_files():
    return set(os.listdir('.'))

def get_dataframes():
    dfs = {}
    target_scope = globals()
    
    for name, val in target_scope.items():
        if name.startswith('_'): continue
        if isinstance(val, pd.DataFrame):
            try:
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
        await pyodide.runPythonAsync(\`
_stdout_capture = CatchOutput()
_stderr_capture = CatchOutput()
sys.stdout = _stdout_capture
sys.stderr = _stderr_capture
_pre_files = list_files()
\`);

        let result = await pyodide.runPythonAsync(code);

        const pythonPostProcess = \`
_post_files = list_files()
_new_files = _post_files - _pre_files - _initial_files
_file_results = []
_images = get_plot_data()
_vars = get_dataframes()

for filename in _new_files:
    if os.path.isfile(filename):
        with open(filename, "rb") as f:
            content = f.read()
            b64 = base64.b64encode(content).decode('utf-8')
            mime = "text/plain"
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
        
        let processedData = await pyodide.runPythonAsync(pythonPostProcess);
        let jsData = processedData.toJs({dict_converter: Object.fromEntries, list_converter: Array.from});
        
        if (typeof result === 'object' && result !== null && result.toString) {
            result = result.toString();
        }

        postMessage({
            type: "SUCCESS",
            id,
            result: result,
            stdout: jsData.stdout,
            stderr: jsData.stderr,
            images: jsData.images,
            files: jsData.files,
            variables: jsData.variables
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

export class PythonSandbox {
    constructor() {
        this.worker = null;
        this.ready = false;
        this.pendingRequests = new Map();
        this.messageCounter = 0;

        const blob = new Blob([PYODIDE_WORKER_SCRIPT], { type: "text/javascript" });
        this.workerUrl = URL.createObjectURL(blob);
    }

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
                                output: result,
                                logs: stdout + stderr,
                                images: images || [],
                                files: files || []
                            });
                        } else {
                            resolver.resolve({
                                error: error,
                                logs: error
                            });
                        }
                        this.pendingRequests.delete(id);
                    }
                }
            };

            this.worker.postMessage({ type: "INIT" });
        });
    }

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

export const pythonSandbox = new PythonSandbox();