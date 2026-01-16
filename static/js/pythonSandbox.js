
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

            if (contentType.includes("image/png")) {
                const blob = await response.blob();
                const base64Data = await this.blobToBase64(blob);
                return {
                    output: "[Image Generated]",
                    logs: "Generated a plot.",
                    images: [{
                        type: "image/png",
                        data: base64Data,
                    }],
                    files: []
                };
            }

            if (contentType.includes("application/octet-stream") || contentType.includes("application/zip")) {
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

    blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const dataUrl = reader.result;
                const base64 = dataUrl.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    getFilenameFromDisposition(disposition) {
        if (!disposition) return "output.bin";
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) {
            return match[1];
        }
        return "download_file";
    }
}

export const pythonSandbox = new PythonSandbox();