import { extname } from "node:path";
import { CONNECTOR_ADAPTER_KEYS } from "../../../constants/connectionConstants.js";
import { CONNECTOR_FILE_LIMITS, CONNECTOR_TEXT_FILE_EXTENSIONS } from "../../../constants/connectorFileConstants.js";
import { CONNECTOR_OPERATIONS } from "../../../constants/connectorOperationConstants.js";
import { isProtectedFile } from "../../../shared/agents/context/data-guard.js";
import { AppError } from "../../../shared/errors/app-error.js";
import type { ConnectorAdapter, ConnectorContext, ConnectorHandle } from "../../../shared/types/connector-catalog.js";
import { requiredString } from "./adapter-configuration.js";

/** An encrypted upload, bound to its workspace by ConnectionCredentialsService; no host filesystem access. */
export class UploadedFileConnectorAdapter implements ConnectorAdapter {
    readonly key = CONNECTOR_ADAPTER_KEYS.file;

    async connect(configuration: Record<string, unknown>, _context: ConnectorContext): Promise<ConnectorHandle> {
        const fileName = requiredString(configuration, "fileName");
        if (fileName.length > 255 || /[\\/\x00-\x1f<>:"|?*]/.test(fileName) || isProtectedFile(fileName)) {
            throw new AppError(400, "Choose a data file with a valid filename. Credential and key files cannot be connected.");
        }
        if (!CONNECTOR_TEXT_FILE_EXTENSIONS.has(extname(fileName).toLowerCase())) {
            throw new AppError(415, "Choose a supported text file: TXT, Markdown, CSV, TSV, JSON, XML, YAML, TOML, INI, LOG, SQL, HTML or RST.");
        }
        const encoded = requiredString(configuration, "fileContent");
        if (encoded.length > CONNECTOR_FILE_LIMITS.base64Characters) throw new AppError(413, "The file must be 5 MB or smaller.");
        if (encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new AppError(400, "The file upload is incomplete. Select the file again.");
        const contents = Buffer.from(encoded, "base64");
        if (contents.toString("base64") !== encoded) throw new AppError(400, "The file upload is invalid. Select the file again.");
        if (!contents.length || contents.length > CONNECTOR_FILE_LIMITS.bytes) throw new AppError(413, "Choose a nonempty file that is 5 MB or smaller.");
        if (configuration.fileSize !== contents.length) throw new AppError(400, "The uploaded file size does not match. Select the file again.");
        let text: string;
        try { text = new TextDecoder("utf-8", { fatal: true }).decode(contents); }
        catch { throw new AppError(415, "The file must contain UTF-8 text. Save it as UTF-8 and upload it again."); }
        if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) throw new AppError(415, "The upload contains binary data. Choose a UTF-8 text file.");
        const metadata = { verification: "uploaded-file", kind: "file", fileName, size: contents.length, mimeType: requiredString(configuration, "mimeType") };
        return {
            metadata,
            execute: async request => {
                const path = request.parameters.path;
                if (request.operation === CONNECTOR_OPERATIONS.list && (path === "" || path === "." || path === "/" || path === fileName)) {
                    return { data: [{ name: fileName, type: "file", size: contents.length }], metadata: { fileName } };
                }
                if (request.operation === CONNECTOR_OPERATIONS.read && path === fileName) return { data: text, metadata: { fileName, size: contents.length } };
                throw new AppError(422, "This connector can only list or read its uploaded file using the displayed filename.");
            },
            close: async () => {},
        };
    }
}
