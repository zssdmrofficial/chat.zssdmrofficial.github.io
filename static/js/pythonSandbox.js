
export class PythonSandbox {
    constructor() {
        this.ready = false;
        this.PythonURL = "https://zssdmr-python.hf.space/";
    }

    async init() {
        this.ready = true;
        return Promise.resolve();
    }

    async execute(code, convId) {
        if (!code) return { logs: "", images: [], files: [] };

        try {
            const response = await fetch(this.PythonURL, {
                method: 'POST',
                body: code
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Server Error (${response.status}): ${errorText}`);
            }

            const contentType = response.headers.get("Content-Type") || "";

            // 1. Matplotlib Plot (image/png)
            if (contentType.includes("image/png")) {
                const blob = await response.blob();
                const base64Data = await this.blobToBase64(blob);
                return {
                    output: "[Image Generated]",
                    logs: "Generated a plot.",
                    images: [{
                        type: "image/png",
                        data: base64Data, // remove data prefix if main.js adds it? 
                        // main.js uses: `data:${img.type};base64,${img.data}`
                        // So I should provide RAW base64 string without prefix.
                    }],
                    files: []
                };
            }

            // 2. File Output (application/octet-stream)
            if (contentType.includes("application/octet-stream")) {
                const blob = await response.blob();
                const base64Data = await this.blobToBase64(blob);
                const filename = this.getFilenameFromDisposition(response.headers.get("Content-Disposition"));

                return {
                    output: `[File Generated: ${filename}]`,
                    logs: `Generated file: ${filename}`,
                    images: [],
                    files: [{
                        name: filename,
                        type: "application/octet-stream",
                        data: base64Data
                    }]
                };
            }

            // 3. Stdout / Log (text/plain)
            const text = await response.text();
            return {
                output: text,
                logs: text,
                images: [],
                files: []
            };

        } catch (err) {
            console.error("Remote Execution Error:", err);
            throw err;
        }
    }

    terminate() {
    }

    // Helper: Convert Blob to Base64 String (without data URI prefix)
    blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const dataUrl = reader.result;
                // data:application/octet-stream;base64,.....
                const base64 = dataUrl.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    getFilenameFromDisposition(disposition) {
        if (!disposition) return "output.bin";
        // Content-Disposition: attachment; filename="filename.ext"
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) {
            return match[1];
        }
        return "download_file";
    }
}

export const pythonSandbox = new PythonSandbox();