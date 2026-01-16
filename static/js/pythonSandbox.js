
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
                body: code,
                cache: 'no-store'
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

            if (contentType.includes("application/zip")) {
                const buffer = await response.arrayBuffer();
                const bytes = new Uint8Array(buffer);

                // 檢查是否為有效的 ZIP (PK..)
                const isZip = bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4B;

                if (!isZip) {
                    const errorText = new TextDecoder().decode(bytes);
                    console.error("ZIP Signature Check Failed. Content:", errorText);
                    return {
                        output: "伺服器回應異常 (非有效 ZIP 格式)，原始內容為:\n" + errorText,
                        logs: "Format Error", images: [], files: []
                    };
                }

                try {
                    // 使用手動恢復 (Local Headers Parser) 作為主要解析方式
                    const recoveryResult = await this.recoverZipManually(buffer);
                    if (recoveryResult) {
                        return recoveryResult;
                    } else {
                        throw new Error("No files found or parsed from ZIP");
                    }

                } catch (e) {
                    console.error("ZIP Parse error:", e);
                    // 解壓失敗，退回直接下載 zip
                    const blob = new Blob([buffer], { type: "application/zip" });
                    const base64Data = await this.blobToBase64(blob);
                    const filename = "result.zip";
                    return {
                        output: `[File Generated: ${filename}] (Parse failed)`,
                        logs: `Generated zip file: ${filename}. Parse failed: ${e.message}`,
                        images: [],
                        files: [{ name: filename, type: "application/zip", data: base64Data }]
                    };
                }
            }

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

    async recoverZipManually(buffer) {
        const data = new DataView(buffer);
        const bytes = new Uint8Array(buffer);
        let offset = 0;
        const images = [];
        const files = [];
        let logs = "Generated content:\n";

        // Loop while we can find a Local File Header Signature (0x04034b50)
        while (offset + 30 < bytes.length) {
            // Check signature: 50 4B 03 04
            if (data.getUint32(offset, true) !== 0x04034b50) {
                break;
            }

            const compression = data.getUint16(offset + 8, true);
            const hiddenCompressedSize = data.getUint32(offset + 18, true);
            const fileNameLen = data.getUint16(offset + 26, true);
            const extraFieldLen = data.getUint16(offset + 28, true);

            const fileNameStart = offset + 30;
            const fileNameBytes = bytes.slice(fileNameStart, fileNameStart + fileNameLen);
            // Decode utf-8
            const fileName = new TextDecoder().decode(fileNameBytes);

            const dataStart = fileNameStart + fileNameLen + extraFieldLen;
            let compressedSize = hiddenCompressedSize;

            if (dataStart + compressedSize > bytes.length) {
                console.error(`[ManualRecovery] Data for ${fileName} exceeds buffer.`);
                break;
            }

            const fileDataCompressed = bytes.slice(dataStart, dataStart + compressedSize);
            let fileDataDecompressed;

            if (compression === 0) {
                // STORED
                fileDataDecompressed = fileDataCompressed;
            } else if (compression === 8) {
                // DEFLATE
                try {
                    if (typeof DecompressionStream === 'undefined') throw new Error("No DecompressionStream");
                    const ds = new DecompressionStream('deflate-raw');
                    const writer = ds.writable.getWriter();
                    writer.write(fileDataCompressed);
                    writer.close();
                    // Read all
                    const response = new Response(ds.readable);
                    fileDataDecompressed = new Uint8Array(await response.arrayBuffer());
                } catch (err) {
                    console.error(`[ManualRecovery] Inflate failed for ${fileName}:`, err);
                    offset = dataStart + compressedSize;
                    continue;
                }
            } else {
                console.warn(`[ManualRecovery] Unsupported compression ${compression} for ${fileName}`);
                offset = dataStart + compressedSize;
                continue;
            }

            // Process the file
            const blob = new Blob([fileDataDecompressed]);
            const base64 = await this.blobToBase64(blob);

            if (fileName.match(/\.(png|jpg|jpeg|gif)$/i)) {
                images.push({
                    type: "image/png",
                    data: base64
                });
                logs += `- Image: ${fileName} (Recovered)\n`;
            } else {
                files.push({
                    name: fileName,
                    type: "application/octet-stream",
                    data: base64
                });
                logs += `- File: ${fileName} (Recovered)\n`;
            }

            offset = dataStart + compressedSize;
        }

        if (images.length === 0 && files.length === 0) return null;

        return {
            output: files.length > 0 ? `[Files Generated]` : `[Image Generated]`,
            logs: logs,
            images: images,
            files: files
        };
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